@extends('emails.layout')

@section('title', $status === 'confirmed' ? 'Booking Confirmed' : 'Booking Cancelled')
@section('preheader', ($status === 'confirmed' ? 'Your booking is confirmed: ' : 'A booking has been cancelled: ').($details['Requirement'] ?? ''))
@section('heading', $status === 'confirmed' ? 'Booking Confirmed' : 'Booking Cancelled')

@section('status')
    @include('emails.partials.status', ['label' => $status === 'confirmed' ? 'Confirmed' : 'Cancelled', 'tone' => $status === 'confirmed' ? 'success' : 'danger'])
@endsection

@section('content')
    <p style="margin:0 0 12px;">Dear {{ $artistName }},</p>
    @if ($status === 'confirmed')
        <p style="margin:0;">The organiser has recorded your booking for the event below as confirmed. Please keep in touch with the contact person for the programme details.</p>
    @else
        <p style="margin:0;">The organiser has cancelled your booking for the event below.</p>
    @endif

    @include('emails.partials.details', ['rows' => $details])

    @if (filled($remarks))
        @include('emails.partials.notice', ['tone' => $status === 'confirmed' ? 'info' : 'warning', 'title' => 'Remarks', 'body' => $remarks])
    @endif

    @include('emails.partials.button', ['url' => $viewUrl, 'label' => 'View Booking'])
@endsection