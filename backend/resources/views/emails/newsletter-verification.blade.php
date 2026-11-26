@extends('emails.layout')

@section('title', 'Opportunity Hub - Confirm your subscription')
@section('preheader', 'Please confirm your email address to receive Opportunity Hub updates.')
@section('heading', 'Confirm your subscription')

@section('content')
    <p style="margin:0 0 12px;">Hello,</p>

    <p style="margin:0;">Thank you for subscribing to Opportunity Hub updates and cultural event news. Please confirm your email address by clicking the button below.</p>

    @include('emails.partials.button', ['url' => $verifyUrl, 'label' => 'Confirm Subscription'])

    <p style="margin:0 0 12px;color:#5b6577;font-size:13px;line-height:20px;">This link will expire in {{ $expiresInHours }} hours. If the button does not work, copy and paste this link into your browser:<br>
        <a href="{{ $verifyUrl }}" style="color:#7c1d3e;word-break:break-all;">{{ $verifyUrl }}</a>
    </p>

    @include('emails.partials.notice', [
        'tone' => 'info',
        'body' => 'If you did not request this subscription, you can safely ignore this email. You will not be subscribed unless you confirm.',
    ])
@endsection
