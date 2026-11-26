<?php

namespace App\Services\Newsletter\Contracts;

use Illuminate\Database\Eloquent\Model;

/**
 * A kind of newsletter notification (e.g. "Upcoming Events").
 *
 * A category only describes *what* is announced and *who* opted in. Eligibility
 * by subscription state, duplicate protection, delivery logging, failure
 * handling, manual resend and unsubscribe links are shared and live in
 * NewsletterNotificationService.
 *
 * To add a category later: implement this interface, add its boolean opt-in
 * column to newsletter_subscribers, and register the class in
 * NotificationCategoryRegistry::CATEGORIES.
 */
interface NotificationCategory
{
    /** Stable key stored in newsletter_notifications.category. */
    public function key(): string;

    /** Human-readable name for admin pages and logs. */
    public function label(): string;

    /** Boolean column on newsletter_subscribers that records the opt-in. */
    public function preferenceColumn(): string;

    /** Global on/off switch (e.g. from config/mail_notifications.php). */
    public function enabled(): bool;

    /** Fresh copy of the announced record, with what payload() needs loaded. */
    public function find(int $referenceId): ?Model;

    /** Null when the record may be announced now, otherwise the reason it may not. */
    public function blockReason(Model $subject): ?string;

    /** Email content built once per run; only the unsubscribe link differs per subscriber. */
    public function payload(Model $subject): array;

    /** Mailable class passed to EmailService::send(). */
    public function mailable(): string;

    /** Constructor arguments for the mailable. */
    public function mailData(array $payload, string $unsubscribeUrl): array;
}
