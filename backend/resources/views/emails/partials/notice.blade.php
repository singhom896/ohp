{{-- Callout. Params: tone (danger|warning|info), title (optional), body (string, escaped; newlines kept) --}}
@php($border = ['danger' => '#b42318', 'warning' => '#c2551f', 'info' => '#7c1d3e'][$tone ?? 'info'] ?? '#7c1d3e')
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:18px 0;">
    <tr>
        <td style="border-left:3px solid {{ $border }};padding:2px 0 2px 14px;font-family:Arial,Helvetica,sans-serif;color:#1d2433;font-size:14px;line-height:22px;">
            @if (! empty($title))<strong style="display:block;color:{{ $border }};">{{ $title }}</strong>@endif
            {!! nl2br(e($body)) !!}
        </td>
    </tr>
</table>
