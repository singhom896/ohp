<?php

namespace App\Exports;

use App\Services\ArtistRegistrationService;
use Illuminate\Support\Facades\DB;
use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithColumnFormatting;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithMultipleSheets;
use Maatwebsite\Excel\Concerns\WithTitle;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Style\NumberFormat;

/** The first sheet ("Data") is the only one written when the CSV format is downloaded. */
class ArtistTemplateExport implements WithMultipleSheets
{
    public function __construct(
        private readonly ArtistRegistrationService $service,
        private readonly string $type,
        private readonly int $countryId,
    ) {
    }

    public function sheets(): array
    {
        $columns = $this->service->columns($this->type);
        $headings = array_map(fn ($c) => $c[0], array_values($columns));

        $instructions = [
            ['Registration type', ArtistRegistrationService::TYPE_LABELS[$this->type]],
            ['Maximum rows per file', \App\Imports\ArtistsImport::MAX_ROWS],
            ['Dates', 'YYYY-MM-DD only (e.g. 1990-05-21).'],
            ['Gender', 'Male, Female or Other (1, 2, 3 also accepted).'],
            ['Master data', 'Use the numeric IDs from the Regions / Art Forms / etc. sheets. Names are never guessed.'],
            ['Lists', 'Language IDs and Art Form IDs: comma separated. Portfolio links: separated by semicolons.'],
            ['Country', 'There is no country column. Your login country is always used.'],
            ['Duplicates', 'Rows whose email already exists (or repeats in the file) are skipped, never updated.'],
            ['Status', 'Imported registrations are created as Pending (not approved) and the account stays inactive until the applicant sets a password from the emailed link.'],
            ['Documents', 'Photos, ID documents, certificates and brochures cannot be uploaded in a spreadsheet. They are saved as empty (not uploaded); add them afterwards via Edit on each registration.'],
            ['Text cells', 'Values beginning with = or @ are rejected.'],
            ['', ''],
            ['Column', 'Required / Format'],
        ];
        foreach ($columns as [$heading, $required, $hint]) {
            $instructions[] = [$heading, ($required ? 'Required. ' : 'Optional. ').$hint];
        }

        $sheets = [
            new ArtistTemplateSheet('Data', [], $headings),
            new ArtistTemplateSheet('Instructions', $instructions),
            new ArtistTemplateSheet('Regions', $this->rows(DB::table('art_regions')->where('status', 1)->where('country_id', $this->countryId)), ['ID', 'Name']),
            new ArtistTemplateSheet('Art Forms', $this->artForms(), ['ID', 'Name', 'Parent ID (0 = top level)']),
            new ArtistTemplateSheet('Languages', $this->rows($this->service->scopeMaster('art_languages', $this->countryId)), ['ID', 'Name']),
            new ArtistTemplateSheet('Awards', $this->rows($this->service->scopeMaster('art_award_masters', $this->countryId)), ['ID', 'Name']),
        ];
        if ($this->type === 'group') {
            $sheets[] = new ArtistTemplateSheet('Group Types', $this->rows($this->service->scopeMaster('art_group_types', $this->countryId)), ['ID', 'Name']);
        } elseif ($this->type === 'institutional') {
            $sheets[] = new ArtistTemplateSheet('Institution Types', $this->rows($this->service->scopeMaster('art_institution_types', $this->countryId)), ['ID', 'Name']);
        }

        return $sheets;
    }

    private function rows($query): array
    {
        return $query->orderBy('name')->get(['id', 'name'])->map(fn ($r) => [$r->id, $r->name])->all();
    }

    private function artForms(): array
    {
        return DB::table('art_forms')->where('status', 1)->where('country_id', $this->countryId)
            ->orderBy('parent_id')->orderBy('name')->get(['id', 'name', 'parent_id'])
            ->map(fn ($r) => [$r->id, $r->name, $r->parent_id])->all();
    }
}

class ArtistTemplateSheet implements FromArray, WithTitle, WithHeadings, ShouldAutoSize, WithColumnFormatting
{
    public function __construct(private readonly string $title, private readonly array $rows, private readonly array $headings = [])
    {
    }

    public function array(): array
    {
        return $this->rows;
    }

    public function title(): string
    {
        return $this->title;
    }

    public function headings(): array
    {
        return $this->headings;
    }

    /** Text format keeps leading zeros, long IDs and dates exactly as typed. */
    public function columnFormats(): array
    {
        if ($this->title !== 'Data') {
            return [];
        }
        $formats = [];
        foreach (array_keys($this->headings) as $i) {
            $formats[Coordinate::stringFromColumnIndex($i + 1)] = NumberFormat::FORMAT_TEXT;
        }

        return $formats;
    }
}

