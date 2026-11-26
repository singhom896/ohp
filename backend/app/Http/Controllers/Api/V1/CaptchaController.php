<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * GET /api/v1/captcha -> { key, img (PNG data URI), expires_in }
 *
 * Stateless captcha for the Next.js login / register forms (no session). The
 * client sends `captcha` + `captcha_key` back with the form; each key is
 * single use and valid for EXPIRE seconds.
 *
 * Drawn here with GD instead of mews/captcha, whose glyphs are sized to the
 * full image height and get clipped (descenders of g/q/y cut off):
 *  - capitals and digits only, without look-alikes (no I L O 0 1),
 *    so nothing hangs below the line and nothing is ambiguous
 *  - fixed size, common baseline, small tilt per character
 *  - noise and lines drawn BEHIND the text, plus one faint line over it
 *  - checked case-insensitively
 */
class CaptchaController extends Controller
{
    use ApiResponse;

    private const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    private const LENGTH = 5;
    private const EXPIRE = 300;           // seconds
    private const WIDTH = 260;
    private const HEIGHT = 72;
    private const FONT_SIZE = 32;         // points
    private const FONT = 'vendor/mews/captcha/assets/fonts/Asap_700.ttf';

    public function show(): JsonResponse
    {
        $text = '';
        for ($i = 0; $i < self::LENGTH; $i++) {
            $text .= self::CHARS[random_int(0, strlen(self::CHARS) - 1)];
        }

        $key = Str::random(40);
        Cache::put(self::cacheKey($key), self::digest($text), self::EXPIRE);

        return $this->success([
            'key'        => $key,
            'img'        => 'data:image/png;base64,' . base64_encode($this->render($text)),
            'expires_in' => self::EXPIRE,
        ])->header('Cache-Control', 'no-store');
    }

    /** True once for the right answer; the key is spent either way. */
    public static function check(string $value, string $key): bool
    {
        $expected = Cache::pull(self::cacheKey($key));

        return is_string($expected) && hash_equals($expected, self::digest($value));
    }

    /** Validation rules shared by login and register. */
    public static function rules(): array
    {
        return [
            'captcha_key' => ['required', 'string', 'max:255'],
            'captcha'     => [
                'required',
                'string',
                'max:20',
                function (string $attribute, mixed $value, \Closure $fail) {
                    $key = (string) request()->input('captcha_key', '');
                    if ($key === '' || !self::check((string) $value, $key)) {
                        $fail('The CAPTCHA code is incorrect or has expired. Please try again.');
                    }
                },
            ],
        ];
    }

    public static function messages(): array
    {
        return [
            'captcha.required'     => 'Please enter the CAPTCHA code.',
            'captcha_key.required' => 'Please reload the CAPTCHA and try again.',
        ];
    }

    // ---------------------------------------------------------------------

    private static function digest(string $text): string
    {
        $normalised = strtoupper(preg_replace('/\s+/', '', $text));

        return hash_hmac('sha256', $normalised, (string) config('app.key'));
    }

    private static function cacheKey(string $key): string
    {
        return 'captcha:' . hash('sha256', $key);
    }

    /** @return string PNG bytes */
    private function render(string $text): string
    {
        $w = self::WIDTH;
        $h = self::HEIGHT;
        $font = base_path(self::FONT);

        $img = imagecreatetruecolor($w, $h);
        imageantialias($img, true);
        $bg = imagecolorallocate($img, 0xFD, 0xF8, 0xF1);
        imagefilledrectangle($img, 0, 0, $w, $h, $bg);

        // Background noise: soft dots and two light curves, behind the text.
        $noise = [
            imagecolorallocate($img, 0xE6, 0xD9, 0xC8),
            imagecolorallocate($img, 0xDD, 0xE3, 0xEE),
            imagecolorallocate($img, 0xEC, 0xD5, 0xDC),
        ];
        for ($i = 0; $i < 160; $i++) {
            imagefilledellipse($img, random_int(0, $w), random_int(0, $h), 2, 2, $noise[$i % 3]);
        }
        imagesetthickness($img, 2);
        for ($i = 0; $i < 2; $i++) {
            $y0 = random_int(10, $h - 10);
            $amp = random_int(6, 14);
            $phase = random_int(0, 314) / 100;
            $prevX = 0;
            $prevY = $y0;
            for ($x = 4; $x <= $w; $x += 4) {
                $y = (int) ($y0 + $amp * sin($x / 28 + $phase));
                imageline($img, $prevX, $prevY, $x, $y, $noise[$i]);
                [$prevX, $prevY] = [$x, $y];
            }
        }

        // Text: dark ink, common baseline, small tilt, centred.
        $ink = [
            imagecolorallocate($img, 0x1B, 0x1F, 0x4A),
            imagecolorallocate($img, 0x7D, 0x15, 0x33),
            imagecolorallocate($img, 0x01, 0x34, 0x7C),
            imagecolorallocate($img, 0x0B, 0x5A, 0x29),
        ];
        $advances = [];
        foreach (str_split($text) as $ch) {
            $box = imagettfbbox(self::FONT_SIZE, 0, $font, $ch);
            $advances[] = abs($box[2] - $box[0]) + 10;
        }
        $x = (int) (($w - array_sum($advances) + 10) / 2);
        $baseline = (int) ($h / 2 + self::FONT_SIZE / 2) + 2;
        foreach (str_split($text) as $i => $ch) {
            $angle = random_int(-14, 14);
            $y = $baseline + random_int(-3, 3);
            imagettftext($img, self::FONT_SIZE, $angle, $x, $y, $ink[random_int(0, 3)], $font, $ch);
            $x += $advances[$i];
        }

        // One faint line across the text (light enough not to hide it).
        $over = imagecolorallocate($img, 0xD9, 0xB3, 0xBE);
        imagesetthickness($img, 1);
        imageline($img, random_int(10, 40), random_int(20, $h - 20), random_int($w - 40, $w - 10), random_int(20, $h - 20), $over);

        ob_start();
        imagepng($img);
        $png = (string) ob_get_clean();
        imagedestroy($img);

        return $png;
    }
}
