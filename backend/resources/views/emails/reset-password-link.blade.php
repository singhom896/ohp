@extends('emails.layout')

@section('title', 'Reset your Opportunity Hub password')
@section('preheader', 'Use this link to choose a new password. It expires in '.$minutes.' minutes.')
@section('heading', 'Reset Your Password')

@section('content')
    <p style="margin:0 0 12px;">Dear {{ $name }},</p>

    <p style="margin:0;">We received a request to reset the password of your Opportunity Hub account. Click the button below to choose a new password.</p>

    @include('emails.partials.button', ['url' => $url, 'label' => 'Reset Password'])

    <p style="margin:0 0 12px;">This link will expire in <strong>{{ $minutes }} minutes</strong> and can be used only once.</p>

    <p style="margin:0 0 12px;color:#5b6577;font-size:13px;line-height:20px;">If the button does not work, copy this address into your browser:<br>
        <a href="{{ $url }}" style="color:#7c1d3e;word-break:break-all;">{{ $url }}</a></p>

    @include('emails.partials.notice', ['tone' => 'info', 'body' => 'If you did not ask to reset your password, you can ignore this email. Your password will not change.'])
@endsection
