@extends('emails.layout')

@section('title', 'Opportunity Hub - '.$actionLabel)
@section('preheader', $artistName.': '.$actionLabel.'.')
@section('heading', 'Artist Profile Awaiting Review')

@section('status')
    @include('emails.partials.status', ['label' => $statusLabel, 'tone' => 'warning'])
@endsection

@section('content')
    <p style="margin:0 0 12px;">Dear {{ $officerName }},</p>

    <p style="margin:0;">An artist has submitted the following for review: <strong>{{ $actionLabel }}</strong>.</p>

    @include('emails.partials.details', ['rows' => [
        'Artist' => $artistName,
        'Type' => $registrationTypeLabel,
        'Reference' => $registrationId,
        'Request No.' => $revisionNumber,
        'Submitted on' => $actionDate,
    ]])

    @include('emails.partials.button', ['url' => $reviewUrl, 'label' => 'Review Request'])
@endsection
