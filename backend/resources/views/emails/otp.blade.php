@extends('emails.layout')

@section('title', 'Opportunity Hub - Verification Code')
@section('preheader', 'Your Opportunity Hub verification code is '.$otp.'.')
@section('heading', 'Your Verification Code')

@section('content')
    <p style="margin:0 0 12px;">Dear User,</p>

    <p style="margin:0;">Use this One-Time Password (OTP) to complete your <strong>{{ ucwords(str_replace('_', ' ', $purpose)) }}</strong> on Opportunity Hub:</p>

    <div style="background:#fdf8f1;border:1px dashed #cfae63;border-radius:10px;text-align:center;padding:20px;margin:20px 0;">
        <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#7c1d3e;font-family:Arial,Helvetica,sans-serif;">{{ $otp }}</span>
    </div>

    <p style="margin:0 0 10px;">This code is valid for <strong>{{ $validityMinutes }} minutes</strong>. Please do not share it with anyone.</p>

    @include('emails.partials.notice', ['tone' => 'info', 'body' => 'If you did not request this code, you can safely ignore this email.'])
@endsection
