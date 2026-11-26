@extends('emails.layout')

@section('title', $initial ? 'Your Opportunity Hub Profile Has Been Approved' : 'Your Opportunity Hub Profile Update Has Been Approved')
@section('preheader', $initial ? 'Your artist profile has been approved.' : 'Your artist profile update has been approved.')
@section('heading', $initial ? 'Profile Approved' : 'Profile Update Approved')

@section('status')
    @include('emails.partials.status', ['label' => 'Approved', 'tone' => 'success'])
@endsection

@section('content')
    <p style="margin:0 0 12px;">Dear {{ $artistName }},</p>

    @if ($initial)
        <p style="margin:0;">Your artist profile has been reviewed and approved. It is now live on Opportunity Hub.</p>
    @else
        <p style="margin:0;">Your artist profile update has been approved and is now live.</p>
    @endif

    @include('emails.partials.details', ['rows' => [
        'Reference' => $registrationId,
        'Approved on' => \App\Support\MailDate::format($decidedAt ?? null),
    ]])

    @if (filled($remarks ?? null))
        @include('emails.partials.notice', ['tone' => 'info', 'title' => 'Remarks', 'body' => $remarks])
    @endif

    @include('emails.partials.button', ['url' => $loginUrl, 'label' => 'Log In'])
@endsection
