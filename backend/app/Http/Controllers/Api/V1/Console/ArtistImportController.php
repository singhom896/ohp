<?php

namespace App\Http\Controllers\Api\V1\Console;

use App\Exports\ArtistImportReportExport;
use App\Exports\ArtistTemplateExport;
use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Controller;
use App\Imports\ArtistsImport;
use App\Services\ArtistRegistrationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Maatwebsite\Excel\Excel as ExcelWriter;
use Maatwebsite\Excel\Facades\Excel;
use Throwable;

/**
 * Bulk artist import, as JSON.
 *
 *   GET  /artists/import/meta                       types + max rows
 *   GET  /artists/import/template/{xlsx|csv}?type=  file download
 *   POST /artists/import                            multipart: registration_type, file -> { token, ... }
 *   GET  /artists/import/{token}                    session rows + counts
 *   POST /artists/import/{token}/process            imports the next batch
 *   GET  /artists/import/{token}/report?format=     file download
 */
class ArtistImportController extends Controller
{
    use ApiResponse;

    private const BATCH_SIZE = 20;

    public function __construct(private readonly ArtistRegistrationService $service)
    {
    }

    public function meta(): JsonResponse
    {
        return $this->success([
            'types'    => ArtistRegistrationService::TYPE_LABELS,
            'max_rows' => ArtistsImport::MAX_ROWS,
        ]);
    }

    public function upload(Request $request): JsonResponse
    {
        $token = $this->createImportSession($request);

        return $this->state($token, 'File checked. Review the rows below, then start the import.', 201);
    }

    public function showState(string $token): JsonResponse
    {
        return $this->state($token);
    }

    public function processBatch(string $token): JsonResponse
    {
        $res = $this->process($token);
        $body = $res->getData(true);

        if ($res->getStatusCode() !== 200) {
            return $this->error($body['message'] ?? 'Import failed.', $res->getStatusCode(), 'import_busy');
        }

        return $this->success($body, $body['done'] ? 'Import completed.' : 'Batch imported.');
    }

    public function template(Request $request, string $format)
    {
        abort_unless(in_array($format, ['xlsx', 'csv'], true), 404);
        $type = $request->validate(['type' => ['required', Rule::in(array_keys(ArtistRegistrationService::TYPES))]])['type'];
        $export = new ArtistTemplateExport($this->service, $type, $this->countryId());

        return Excel::download(
            $export,
            "artist-import-template-{$type}.{$format}",
            $format === 'csv' ? ExcelWriter::CSV : ExcelWriter::XLSX
        );
    }

    /**
     * Parse + pre-validate the uploaded sheet and store it as an import
     * session. Returns the session token. Shared with the JSON API.
     *
     * @throws ValidationException
     */
    protected function createImportSession(Request $request): string
    {
        $countryId = $this->countryId();
        $validated = $request->validate([
            'registration_type' => ['required', Rule::in(array_keys(ArtistRegistrationService::TYPES))],
            'file' => ['required', 'file', 'max:5120', 'mimes:xlsx,csv,txt', function ($attribute, $value, $fail) {
                if (! in_array(strtolower($value->getClientOriginalExtension()), ['xlsx', 'csv'], true)) {
                    $fail('Only .xlsx and .csv files are accepted.');
                }
            }],
        ]);
        $type = $validated['registration_type'];
        $file = $request->file('file');
        $readerType = strtolower($file->getClientOriginalExtension()) === 'csv' ? ExcelWriter::CSV : ExcelWriter::XLSX;

        $import = new ArtistsImport();
        try {
            Excel::import($import, $file, null, $readerType);
        } catch (Throwable $e) {
            Log::warning('Artist import parse failed', ['error' => $e->getMessage()]);
            $message = str_contains($e->getMessage(), 'data rows')
                ? $e->getMessage()
                : 'The file could not be read. Make sure it is a valid .xlsx or UTF-8 .csv file based on the downloaded template.';

            throw ValidationException::withMessages(['file' => $message]);
        }

        $missing = [];
        foreach ($this->service->columns($type) as [$heading, $required]) {
            if ($required && ! in_array(Str::slug($heading, '_'), $import->headings, true)) {
                $missing[] = $heading;
            }
        }
        if ($missing) {
            throw ValidationException::withMessages(['file' => 'Missing required column(s): '.implode(', ', $missing).'. Download the template for the selected registration type.']);
        }
        if (! $import->rows) {
            throw ValidationException::withMessages(['file' => 'The file contains no data rows.']);
        }

        $rows = [];
        $seenEmails = [];
        foreach ($import->rows as $item) {
            [$data, $normErrors] = $this->service->normalize($type, $item['values']);
            $entry = [
                'row' => $item['row'],
                'name' => $data['full_name'] ?? null,
                'email' => $data['email'],
                'status' => 'valid',
                'message' => null,
                'regno' => null,
                'data' => null,
            ];

            if ($data['email'] !== null && isset($seenEmails[$data['email']])) {
                $entry['status'] = 'skipped';
                $entry['message'] = "Duplicate email within the file (first used in row {$seenEmails[$data['email']]}).";
            } elseif ($data['email'] !== null && filter_var($data['email'], FILTER_VALIDATE_EMAIL) && $this->service->emailExists($data['email'])) {
                $entry['status'] = 'skipped';
                $entry['message'] = 'A user with this email is already registered.';
            } else {
                $errors = array_merge($normErrors, $this->service->validate($type, $data, $countryId));
                if ($errors) {
                    $entry['status'] = 'failed';
                    $entry['message'] = implode(' ', array_unique($errors));
                } else {
                    $entry['data'] = $data;
                }
            }
            if ($data['email'] !== null) {
                $seenEmails[$data['email']] ??= $item['row'];
            }
            $rows[] = $entry;
        }

        $this->purgeOldStates();
        $token = (string) Str::uuid();
        $this->saveState($token, [
            'user_id' => Auth::id(),
            'country_id' => $countryId,
            'type' => $type,
            'file_name' => $file->getClientOriginalName(),
            'created_at' => now()->toIso8601String(),
            'rows' => $rows,
        ]);

        return $token;
    }

    private function process(string $token): JsonResponse
    {
        $lock = Cache::lock("artist-import:{$token}", 300);
        if (! $lock->get()) {
            return response()->json(['message' => 'This import is already being processed.'], 409);
        }

        try {
            set_time_limit(0);
            $state = $this->loadState($token);
            $countryId = $this->countryId();
            $type = $state['type'];

            $done = 0;
            foreach ($state['rows'] as &$row) {
                if ($row['status'] !== 'valid') {
                    continue;
                }
                if ($done >= self::BATCH_SIZE) {
                    break;
                }
                $done++;
                $this->importRow($row, $type, $countryId);
            }
            unset($row);

            $this->saveState($token, $state);
            $counts = $this->counts($state);

            return response()->json($counts + ['done' => $counts['pending'] === 0]);
        } finally {
            $lock->release();
        }
    }

    public function report(Request $request, string $token)
    {
        $state = $this->loadState($token);
        $format = $request->query('format') === 'csv' ? 'csv' : 'xlsx';

        $lines = [];
        foreach ($state['rows'] as $row) {
            if ($row['status'] === 'imported' && empty($row['message'])) {
                continue;
            }
            $lines[] = [
                'row' => $row['row'],
                'name' => $row['name'],
                'email' => $row['email'],
                'result' => match ($row['status']) {
                    'valid' => 'not processed',
                    'imported' => 'imported (warning)',
                    default => $row['status'],
                },
                'regno' => $row['regno'],
                'message' => $row['message'],
            ];
        }

        return Excel::download(
            new ArtistImportReportExport($lines),
            "artist-import-report-{$state['type']}.{$format}",
            $format === 'csv' ? ExcelWriter::CSV : ExcelWriter::XLSX
        );
    }

    private function importRow(array &$row, string $type, int $countryId): void
    {
        $data = $row['data'];
        $row['data'] = null;

        if ($this->service->emailExists($data['email'])) {
            $row['status'] = 'skipped';
            $row['message'] = 'A user with this email is already registered.';

            return;
        }
        $errors = $this->service->validate($type, $data, $countryId);
        if ($errors) {
            $row['status'] = 'failed';
            $row['message'] = implode(' ', array_unique($errors));

            return;
        }

        try {
            $result = $this->service->register($type, $data, $countryId, (int) Auth::id());
            $row['status'] = 'imported';
            $row['regno'] = $result['user']->regno;
            $row['message'] = $result['notified'] ? null : 'Registered, but the account setup email could not be sent. Resend it manually.';
        } catch (Throwable $e) {
            Log::error('Artist import row failed', ['row' => $row['row'], 'error' => $e->getMessage()]);
            $row['status'] = 'failed';
            $row['message'] = 'The registration could not be saved and was rolled back. Please retry this row.';
        }
    }

    protected function counts(array $state): array
    {
        $counts = ['total' => count($state['rows']), 'imported' => 0, 'failed' => 0, 'skipped' => 0, 'pending' => 0];
        foreach ($state['rows'] as $row) {
            $counts[$row['status'] === 'valid' ? 'pending' : $row['status']]++;
        }

        return $counts;
    }

    private function countryId(): int
    {
        $countryId = authUserData('country_id');
        abort_if(empty($countryId), 403, 'Your login is not associated with a country.');

        return (int) $countryId;
    }

    private function statePath(string $token): string
    {
        abort_unless(preg_match('/^[0-9a-f-]{36}$/', $token) === 1, 404);

        return storage_path("app/artist-imports/{$token}.json");
    }

    protected function loadState(string $token): array
    {
        $path = $this->statePath($token);
        abort_unless(is_file($path), 404, 'Import session not found or expired.');
        $state = json_decode(file_get_contents($path), true);
        abort_unless(is_array($state) && (int) $state['user_id'] === (int) Auth::id(), 403);
        abort_if((int) $state['country_id'] !== $this->countryId(), 403);

        return $state;
    }

    private function saveState(string $token, array $state): void
    {
        File::ensureDirectoryExists(storage_path('app/artist-imports'));
        file_put_contents($this->statePath($token), json_encode($state, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), LOCK_EX);
    }

    private function purgeOldStates(): void
    {
        foreach (File::glob(storage_path('app/artist-imports/*.json')) as $file) {
            if (filemtime($file) < now()->subDay()->getTimestamp()) {
                @unlink($file);
            }
        }
    }

    private function state(string $token, string $message = 'OK', int $status = 200): JsonResponse
    {
        $state = $this->loadState($token);
        unset($state['user_id']);
        $state['rows'] = array_map(function ($r) {
            unset($r['data']);
            return $r;
        }, $state['rows']);

        return $this->success([
            'token'  => $token,
            'state'  => $state,
            'counts' => $this->counts($state),
        ], $message, $status);
    }
}
