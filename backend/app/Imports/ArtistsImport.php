<?php

namespace App\Imports;

use Maatwebsite\Excel\Concerns\OnEachRow;
use Maatwebsite\Excel\Concerns\WithChunkReading;
use Maatwebsite\Excel\Concerns\WithHeadingRow;
use Maatwebsite\Excel\Row;
use RuntimeException;

/**
 * Streams the uploaded sheet in chunks and collects raw rows (heading slug => cell value).
 * Validation and persistence are handled by ArtistRegistrationService.
 */
class ArtistsImport implements OnEachRow, WithHeadingRow, WithChunkReading
{
    public const MAX_ROWS = 500;

    public array $rows = [];

    public array $headings = [];

    public function onRow(Row $row): void
    {
        $values = $row->toArray(null, false, false);
        if (! $this->headings) {
            $this->headings = array_keys($values);
        }
        if ($row->isEmpty()) {
            return;
        }
        if (count($this->rows) >= self::MAX_ROWS) {
            throw new RuntimeException('The file has more than '.self::MAX_ROWS.' data rows. Split it into smaller files.');
        }
        $this->rows[] = ['row' => $row->getIndex(), 'values' => $values];
    }

    public function chunkSize(): int
    {
        return 100;
    }
}
