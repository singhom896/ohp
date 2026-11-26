<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Controller;
use App\Services\NewsletterService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Public newsletter endpoints for the Next.js website (no login).
 *
 *   POST /public/newsletter/subscribe     { email }          footer form -> confirmation email
 *   POST /public/newsletter/verify        { token }          /newsletter/verify page
 *   GET  /public/newsletter/unsubscribe   ?id=&token=        /newsletter/unsubscribe page (shows the email)
 *   POST /public/newsletter/unsubscribe   { id, token }      confirm button on that page
 *
 * Unsubscribing needs a click on the page (a GET never unsubscribes), so
 * email link scanners cannot unsubscribe people.
 */
class NewsletterController extends Controller
{
    use ApiResponse;

    public function __construct(private readonly NewsletterService $newsletter) {}

    public function subscribe(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'max:191', 'email:rfc,strict'],
        ], [
            'email.required' => 'Please enter your email address.',
            'email.email'    => 'Please enter a valid email address.',
        ]);

        return $this->answer($this->newsletter->subscribe($data['email'], $request));
    }

    public function verify(Request $request): JsonResponse
    {
        $data = $request->validate(['token' => ['required', 'string', 'max:100']]);

        return $this->answer($this->newsletter->verify($data['token']));
    }

    public function unsubscribeInfo(Request $request): JsonResponse
    {
        $data = $request->validate(['id' => ['required', 'integer'], 'token' => ['required', 'string', 'max:100']]);
        $subscriber = $this->newsletter->subscriberForUnsubscribe((int) $data['id'], $data['token']);
        if (! $subscriber) {
            return $this->error('This unsubscribe link is invalid.', 404, 'invalid_link');
        }

        return $this->success([
            'email'        => $subscriber->email,
            'unsubscribed' => (bool) $subscriber->unsubscribed_at,
        ]);
    }

    public function unsubscribe(Request $request): JsonResponse
    {
        $data = $request->validate(['id' => ['required', 'integer'], 'token' => ['required', 'string', 'max:100']]);
        $subscriber = $this->newsletter->subscriberForUnsubscribe((int) $data['id'], $data['token']);
        if (! $subscriber) {
            return $this->error('This unsubscribe link is invalid.', 404, 'invalid_link');
        }

        return $this->answer($this->newsletter->unsubscribe($subscriber));
    }

    private function answer(array $result): JsonResponse
    {
        return $result['success']
            ? $this->success(null, $result['message'])
            : $this->error($result['message'], 422, 'newsletter_error');
    }
}
