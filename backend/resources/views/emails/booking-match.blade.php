@extends('emails.layout')

@section('title', $invited ? 'Engagement Request' : 'New Performance Opportunity')
@section('preheader', ($invited ? 'You have been invited to perform: ' : 'An organisation is looking for artists like you: ').($details['Requirement'] ?? ''))
@section('heading', $invited ? 'Engagement Request' : 'New Performance Opportunity')

@section('content')
    <p style="margin:0 0 12px;">Dear {{ $artistName }},</p>
    @if ($invited)
        <p style="margin:0;">{{ $details['Organised by'] ?? 'An Engagement Partner' }} has viewed your profile on Opportunity Hub and would like you to perform at the event below.</p>
    @else
        <p style="margin:0;">An Engagement Partner on Opportunity Hub has posted an opportunity that matches your art form and location.</p>
    @endif

    @include('emails.partials.details', ['rows' => $details])

    @if ($invited && filled($inviteMessage))
        @include('emails.partials.notice', ['tone' => 'info', 'title' => 'Message from the organiser', 'body' => $inviteMessage])
    @endif

    <p style="margin:0;">
        @if ($invited)
            Log in to accept or decline the request.
        @else
            Log in to view the full opportunity and let the organiser know whether you are interested.
        @endif
        The organiser will contact you by phone or email to confirm the booking. Opportunity Hub does not take any fee or payment.
    </p>

    @include('emails.partials.button', ['url' => $viewUrl, 'label' => $invited ? 'Respond to Request' : 'View Opportunity'])
@endsection
