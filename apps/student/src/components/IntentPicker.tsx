import { FieldError } from './states';
import {
  MATCH_TYPES,
  MATCH_TYPE_DESCRIPTIONS,
  MATCH_TYPE_LABELS,
  type IntentFlags,
  type MatchType,
} from '../types';

export interface IntentPickerProps {
  value: IntentFlags;
  onChange: (value: IntentFlags) => void;
  legend?: string;
  hint?: string;
}

/**
 * Connection-type selector.
 *
 * The entire matching engine keys off `intent_flags` — a request is only allowed
 * when both students enabled the same type. Previously these flags were
 * hardcoded at onboarding (friendship + study) and never editable, which made
 * dating, hackathon and project connections impossible to ever create.
 */
export function IntentPicker({ value, onChange, legend, hint }: IntentPickerProps) {
  const noneSelected = !Object.values(value).some(Boolean);

  return (
    <fieldset className="choice-set span-2">
      <legend className="field-label">{legend ?? 'What are you here for?'}</legend>
      <span className="hint">{hint ?? 'Choose at least one. You can change this any time.'}</span>
      <div className="choice-grid">
        {MATCH_TYPES.map((type: MatchType) => (
          <label className="choice" key={type}>
            <input
              type="checkbox"
              checked={value[type]}
              onChange={(event) => onChange({ ...value, [type]: event.target.checked })}
            />
            <span className="choice-copy">
              <strong>{MATCH_TYPE_LABELS[type]}</strong>
              <span>{MATCH_TYPE_DESCRIPTIONS[type]}</span>
            </span>
          </label>
        ))}
      </div>
      {noneSelected && <FieldError>Select at least one connection type.</FieldError>}
    </fieldset>
  );
}
