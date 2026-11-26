<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithHeadings;

class ArtistImportReportExport implements FromArray, WithHeadings, ShouldAutoSize
{
    public function __construct(private readonly array $rows)
    {
    }

    public function headings(): array
    {
        return ['Row', 'Name', 'Email', 'Result', 'Registration No', 'Message'];
    }

    public function array(): array
    {
        return array_map(fn (array $r) => array_map([self::class, 'safe'], [
            $r['row'], $r['name'] ?? '', $r['email'] ?? '', $r['result'], $r['regno'] ?? '', $r['message'] ?? '',
        ]), $this->rows);
    }

    /** Neutralise spreadsheet formula injection. */
    public static function safe(mixed $value): mixed
    {
        if (is_string($value) && preg_match('/^[=+\-@\t\r]/', $value)) {
            return "'".$value;
        }

        return $value;
    }
}
