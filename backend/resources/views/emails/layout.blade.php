{{--
    Opportunity Hub email layout: logo header, one white content area and a
    maroon footer. Website colours: wine #7c1d3e, gold #cfae63, cream #fdf8f1.

    Sections a template may define:
      title      - <title> text
      preheader  - hidden inbox preview text
      heading    - main heading (optional)
      status     - optional status badge (use emails.partials.status)
      content    - body
    Table-based, inline-styled markup for Gmail, Outlook and mobile clients.
--}}
@php
    $brandName = 'Opportunity Hub';
    $logoFile = public_path('assets/email/oh-mark.png');
    // Inline (CID) logo while sending, so it shows even when remote images are blocked;
    // absolute URL for browser previews / Mailable::render().
    $logoSrc = (isset($message) && $message instanceof \Illuminate\Mail\Message && is_file($logoFile))
        ? $message->embed($logoFile)
        : rtrim((string) config('app.url'), '/').'/assets/email/oh-mark.png';
    $site = rtrim((string) config('app.frontend_url'), '/');

    $cream = '#fdf8f1';
    $wine = '#7c1d3e';
    $gold = '#cfae63';
    $ink = '#1d2433';
@endphp
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
    <title>@yield('title', $brandName)</title>
    <!--[if mso]>
    <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
    <![endif]-->
    <style>
        body { margin: 0 !important; padding: 0 !important; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
        img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
        a { color: #7c1d3e; }
        @media only screen and (max-width: 620px) {
            .em-container { width: 100% !important; }
            .em-pad { padding-left: 22px !important; padding-right: 22px !important; }
            .em-btn a { display: block !important; }
        }
    </style>
</head>
<body bgcolor="{{ $cream }}" style="margin:0;padding:0;background-color:{{ $cream }};font-family:Arial,Helvetica,sans-serif;color:{{ $ink }};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
    @yield('preheader', $brandName)&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;
</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="{{ $cream }}" style="background-color:{{ $cream }};">
    <tr>
        <td align="center" style="padding:24px 12px;">
            <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" align="center"><tr><td><![endif]-->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="em-container" style="width:600px;max-width:600px;background-color:#ffffff;border:1px solid #eadfce;border-radius:12px;border-collapse:separate;overflow:hidden;">

                {{-- Header: logo + wordmark, gold rule --}}
                <tr>
                    <td class="em-pad" bgcolor="#ffffff" style="padding:18px 36px;border-bottom:3px solid {{ $gold }};">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                                <td valign="middle" style="padding-right:12px;">
                                    <img src="{{ $logoSrc }}" width="44" height="48" alt="" style="display:block;width:44px;height:auto;border:0;">
                                </td>
                                <td valign="middle" style="font-family:Georgia,'Times New Roman',serif;">
                                    <div style="font-size:22px;line-height:26px;font-weight:700;color:{{ $wine }};">{{ $brandName }}</div>
                                    <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:14px;letter-spacing:2px;font-weight:700;color:#9a7b3a;text-transform:uppercase;">For Indian Artists · Ministry of Culture</div>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>

                {{-- Content --}}
                <tr>
                    <td class="em-pad" style="padding:28px 36px 30px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:{{ $ink }};">
                        @hasSection('heading')
                            <h1 style="margin:0 0 6px;color:{{ $wine }};font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:28px;font-weight:700;">@yield('heading')</h1>
                        @endif
                        @hasSection('status')
                            <div style="margin:0 0 18px;">@yield('status')</div>
                        @elseif ($__env->hasSection('heading'))
                            <div style="height:12px;line-height:12px;font-size:0;">&nbsp;</div>
                        @endif

                        @yield('content')

                        @unless ($__env->hasSection('no_signature'))
                            <p style="margin:26px 0 0;">Regards,<br><strong style="color:{{ $wine }};">{{ $brandName }} Team</strong></p>
                        @endunless
                    </td>
                </tr>

                {{-- Footer --}}
                <tr>
                    <td align="center" bgcolor="{{ $wine }}" class="em-pad" style="background-color:{{ $wine }};border-top:3px solid {{ $gold }};padding:14px 36px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#ffffff;">
                        Ministry of Culture, Government of India<br>
                        This is an automated message. Please do not reply.
                        @if ($site !== '')
                            · <a href="{{ $site }}" style="color:#f0d9a0;text-decoration:underline;">Visit website</a>
                        @endif
                    </td>
                </tr>
            </table>
            <!--[if mso]></td></tr></table><![endif]-->
        </td>
    </tr>
</table>
</body>
</html>
