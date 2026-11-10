'use client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import s from './spy.module.css';
export function SpySelect({
  label,
  value,
  onChange,
  options,
  id,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: (string | { value: string; label: string })[];
  id?: string;
}) {
  return (
    <Select
      value={value || '__spy_empty'}
      onValueChange={(v) => onChange(v === '__spy_empty' ? '' : v)}
    >
      <SelectTrigger
        id={id}
        className={`${s.selectTrigger} focus:ring-0 focus:border-border`}
        aria-label={label}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => {
          const item = typeof option === 'string' ? { value: option, label: option } : option;
          return (
            <SelectItem key={item.value || '__spy_empty'} value={item.value || '__spy_empty'}>
              {item.label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
