{{-- Status badge. Params: label (string), tone (success|danger|warning|info) --}}
@php
    [$bg, $fg] = [
        'success' => ['#e7f6ec', '#17713a'],
        'danger' => ['#fdecea', '#b42318'],
        'warning' => ['#fff1dc', '#9a520b'],
        'info' => ['#fbeef2', '#7c1d3e'],
    ][$tone ?? 'info'] ?? ['#fbeef2', '#7c1d3e'];
@endphp
<span style="display:inline-block;background-color:{{ $bg }};color:{{ $fg }};font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px;font-weight:700;padding:4px 10px;border-radius:4px;">{{ $label }}</span>
