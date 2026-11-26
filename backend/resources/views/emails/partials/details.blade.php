{{-- Compact key/value list. Params: rows (label => value; blank values skipped) --}}
@php($visibleRows = collect($rows ?? [])->filter(fn ($value) => filled($value)))
@if ($visibleRows->isNotEmpty())
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:18px 0;background-color:#fdf8f1;border:1px solid #f0e4d2;border-radius:8px;border-collapse:separate;">
    <tr><td style="padding:8px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            @foreach ($visibleRows as $label => $value)
                <tr>
                    <td valign="top" style="padding:6px 12px 6px 0;font-family:Arial,Helvetica,sans-serif;color:#5b6577;font-size:14px;line-height:20px;white-space:nowrap;">{{ $label }}</td>
                    <td valign="top" style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;color:#1d2433;font-size:14px;line-height:20px;font-weight:700;word-break:break-word;">{{ $value }}</td>
                </tr>
            @endforeach
        </table>
    </td></tr>
</table>
@endif
