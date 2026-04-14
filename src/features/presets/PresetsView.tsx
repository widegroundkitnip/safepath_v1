import type { PresetDefinitionDto } from '../../types/app'

type PresetsViewProps = {
  presets: PresetDefinitionDto[]
  selectedPresetId: string
  onSelectPreset: (presetId: string) => void
  onUsePreset: () => void
}

export function PresetsView({
  presets,
  selectedPresetId,
  onSelectPreset,
  onUsePreset,
}: PresetsViewProps) {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-white">Presets</h2>
        <p className="mt-2 text-sm text-white/60">
          Choose how Safepath maps files into your destination. Build a plan from the Home flow after
          scanning.
        </p>
      </div>

      <ul className="space-y-4">
        {presets.map((preset) => {
          const active = preset.presetId === selectedPresetId
          return (
            <li
              key={preset.presetId}
              className={`rounded-2xl border p-6 backdrop-blur-xl transition-colors ${
                active
                  ? 'border-violet-400/50 bg-violet-500/15'
                  : 'border-white/10 bg-white/5 hover:border-white/20'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectPreset(preset.presetId)}
                className="w-full text-left"
              >
                <h3 className="text-lg font-medium text-white">{preset.name}</h3>
                <p className="mt-2 text-sm text-white/65">{preset.description}</p>
              </button>
              {active ? (
                <p className="mt-3 text-xs font-medium text-violet-200">Selected for next plan build</p>
              ) : null}
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        onClick={onUsePreset}
        disabled={!selectedPresetId}
        className="rounded-2xl bg-gradient-to-r from-violet-500 to-blue-500 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Use preset and continue
      </button>
    </div>
  )
}
