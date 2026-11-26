@extends('emails.layout')

@section('title', 'An Artist Is Interested')
@section('preheader', $artistName.' is interested in '.($details['Requirement'] ?? 'your requirement'))
@section('heading', 'An Artist Is Interested')

@section('status')
    @include('emails.partials.status', ['label' => 'Interested', 'tone' => 'success'])
@endsection

@section('content')
    <p style="margin:0 0 12px;">Dear {{ $contactName }},</p>
    <p style="margin:0;"><strong>{{ $artistName }}</strong> ({{ $artistType }}) has shown interest in your event requirement.</p>

    @include('emails.partials.details', ['rows' => $details + [
        'Artist email' => $artistEmail,
        'Artist mobile' => $artistMobile,
    ]])

    @if (filled($note))
        @include('emails.partials.notice', ['tone' => 'info', 'title' => 'Message from the artist', 'body' => $note])
    @endif

    <p style="margin:0;">Please contact the artist by phone or email. Once the booking is confirmed, record it on the requirement page.</p>

    @include('emails.partials.button', ['url' => $viewUrl, 'label' => 'View Requirement'])
@endsection