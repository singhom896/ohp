@extends('emails.layout')

@section('title', 'Submission Received – '.$actionLabel)
@section('preheader', 'Your submission has been received and is awaiting review by the Zonal Cultural Centre.')
@section('heading', 'Submission Received')

@section('status')
    @include('emails.partials.status', ['label' => $statusLabel, 'tone' => 'warning'])
@endsection

@section('content')
    <p style="margin:0 0 12px;">Dear {{ $artistName }},</p>

    <p style="margin:0;"><strong>{{ $actionLabel }}</strong> – received successfully. It is now awaiting review by the Zonal Cultural Centre (ZCC). We will email you once a decision is made.</p>

    @include('emails.partials.details', ['rows' => [
        'Reference' => $registrationId,
        'Request No.' => $revisionNumber,
        'Submitted on' => \App\Support\MailDate::format($submittedAt ?? null),
    ]])

    @include('emails.partials.button', ['url' => $dashboardUrl, 'label' => 'Track My Application'])
@endsection
