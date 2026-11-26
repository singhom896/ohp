@extends('emails.layout')

@section('title', 'Opportunity Hub - Subscription confirmed')
@section('preheader', 'Your newsletter subscription is now active.')
@section('heading', 'Subscription Confirmed')

@section('status')
    @include('emails.partials.status', ['label' => 'Active', 'tone' => 'success'])
@endsection

@section('content')
    <p style="margin:0 0 12px;">Hello,</p>

    <p style="margin:0;">Your email address <strong>{{ $email }}</strong> is now subscribed to Opportunity Hub updates and cultural event news.</p>

    <p style="margin:18px 0 0;color:#5b6577;font-size:13px;line-height:20px;">No longer wish to receive these emails?
        <a href="{{ $unsubscribeUrl }}" style="color:#7c1d3e;">Unsubscribe here</a>.
    </p>
@endsection
