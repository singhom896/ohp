@extends('emails.layout')

@section('title', 'Update Required – Opportunity Hub Profile')
@section('preheader', 'Please review the remarks, correct your profile and resubmit it.')
@section('heading', $initial ? 'Application Update Required' : 'Profile Update Required')

@section('status')
    @include('emails.partials.status', ['label' => 'Rejected', 'tone' => 'danger'])
@endsection

@section('content')
    <p style="margin:0 0 12px;">Dear {{ $artistName }},</p>

    @if ($initial)
        <p style="margin:0;">Your artist profile application has been reviewed and needs changes before it can be approved.</p>
    @else
        <p style="margin:0;">Your artist profile update has been rejected. Your approved profile remains unchanged.</p>
    @endif

    @include('emails.partials.notice', ['tone' => 'danger', 'title' => 'Reason for rejection', 'body' => $remarks])

    @include('emails.partials.details', ['rows' => [
        'Reference' => $registrationId,
        'Reviewed on' => \App\Support\MailDate::format($decidedAt ?? null),
    ]])

    <p style="margin:0;">Please log in, update your profile according to the remarks, and submit it again for approval.</p>

    @include('emails.partials.button', ['url' => $loginUrl, 'label' => 'Log In and Update Profile'])
@endsection
