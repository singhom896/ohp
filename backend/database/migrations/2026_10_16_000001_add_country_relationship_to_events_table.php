<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $pretending = DB::connection()->pretending();
        $indiaId = $pretending
            ? null
            : DB::table('countries')->where('alpha_2', 'IN')->value('id');

        if (!$pretending && $indiaId === null) {
            throw new RuntimeException('India must exist in countries before event country mappings can be created.');
        }

        Schema::table('events', function (Blueprint $table) {
            $table->foreignId('country_id')
                ->nullable()
                ->after('state_id')
                ->constrained('countries')
                ->nullOnDelete();
        });

        Schema::create('event_country_states', function (Blueprint $table) {
            $table->foreignId('country_id')->constrained('countries')->cascadeOnDelete();
            $table->integer('state_code');
            $table->primary(['country_id', 'state_code']);
            $table->foreign('state_code')->references('StateCode')->on('states')->cascadeOnDelete();
        });

        if ($pretending) {
            return;
        }

        $stateCodes = DB::table('states')
            ->whereNotNull('StateCode')
            ->pluck('StateCode')
            ->map(fn ($stateCode) => [
                'country_id' => $indiaId,
                'state_code' => $stateCode,
            ])
            ->all();

        if ($stateCodes !== []) {
            DB::table('event_country_states')->insert($stateCodes);
            DB::table('events')
                ->whereIn('state_id', array_column($stateCodes, 'state_code'))
                ->update(['country_id' => $indiaId]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('event_country_states');

        Schema::table('events', function (Blueprint $table) {
            $table->dropConstrainedForeignId('country_id');
        });
    }
};
