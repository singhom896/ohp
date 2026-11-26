@extends('emails.layout')

@section('title', 'Upcoming Event - '.$details['title'])
@section('preheader', $details['title'].' · '.$details['when'])
@section('heading', 'Upcoming Event')

@section('status')
    @include('emails.partials.status', ['label' => 'New Event', 'tone' => 'info'])
@endsection

@section('content')
    @php
        // Public HTTPS image when available; otherwise embed the local file so it shows on localhost too.
        $imageSrc = null;
        if (! empty($details['image_url']) && preg_match('#^https://#i', $details['image_url'])) {
            $imageSrc = $details['image_url'];
        } elseif (! empty($details['image_path']) && isset($message) && $message instanceof \Illuminate\Mail\Message && is_file($details['image_path'])) {
            $imageSrc = $message->embed($details['image_path']);
        } elseif (! empty($details['image_url'])) {
            $imageSrc = $details['image_url'];
        }
    @endphp

    @if ($imageSrc)
        <img src="{{ $imageSrc }}" width="528" alt="{{ $details['title'] }}" style="display:block;width:100%;max-width:528px;height:auto;border:0;border-radius:8px;margin:0 0 18px;">
    @endif

    <h2 style="margin:0 0 10px;color:#7c1d3e;font-family:Georgia,'Times New Roman',serif;font-size:19px;line-height:26px;font-weight:700;">{{ $details['title'] }}</h2>

    @include('emails.partials.details', ['rows' => array_filter([
        'Date & Time' => $details['when'],
        'Venue / Location' => $details['location'],
    ])])

    @if ($details['description'] !== '')
        <p style="margin:0;white-space:pre-line;">{{ $details['description'] }}</p>
    @endif

    @include('emails.partials.button', ['url' => $details['detail_url'], 'label' => 'View Event Details'])

    <p style="margin:18px 0 0;color:#5b6577;font-size:13px;line-height:20px;">You are receiving this email because you subscribed to Opportunity Hub updates.
        <a href="{{ $unsubscribeUrl }}" style="color:#7c1d3e;">Unsubscribe</a>.
    </p>
@endsection
