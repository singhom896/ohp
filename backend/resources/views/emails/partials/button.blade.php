{{-- CTA button. Params: url, label, variant (primary = wine | secondary = gold) --}}
@php($bg = ($variant ?? 'primary') === 'primary' ? '#7c1d3e' : '#a8812f')
<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="em-btn" style="margin:22px 0;">
    <tr>
        <td align="center" bgcolor="{{ $bg }}" style="border-radius:8px;background-color:{{ $bg }};">
            <a href="{{ $url }}" target="_blank" style="display:inline-block;padding:12px 26px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">{{ $label }}</a>
        </td>
    </tr>
</table>
