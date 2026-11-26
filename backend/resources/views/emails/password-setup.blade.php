@extends('emails.layout')

@section('title', 'Opportunity Hub - Set your password')
@section('preheader', 'Set your password to activate your Opportunity Hub account.')
@section('heading', 'Set Your Password')

@section('content')
    <p style="margin:0 0 12px;">Welcome to Opportunity Hub.</p>

    <p style="margin:0;">An account has been created for you. Use the secure link below to set your password and activate your account.</p>

    @include('emails.partials.button', ['url' => $url,'label' => 'Set Account Password'])

    <p style="margin:0;color:#5b6577;font-size:13px;line-height:20px;">This link expires in 24 hours. If you were not expecting this email, you can ignore it.</p>
@endsection
