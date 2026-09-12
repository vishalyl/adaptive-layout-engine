// A tiny inline icon set. Deliberately not a dependency: six 16x16
// stroke icons at 1.5px weight, all sharing one <svg> shell so they
// inherit colour and size from the button that contains them.

export type IconName = 'copy' | 'check' | 'chevron-left' | 'cursor' | 'github' | 'mail' | 'check-square';

const PATHS: Record<IconName, string> = {
  copy:          'M5 5V3.5A1.5 1.5 0 0 1 6.5 2h6A1.5 1.5 0 0 1 14 3.5v6a1.5 1.5 0 0 1-1.5 1.5H11M3.5 5h6A1.5 1.5 0 0 1 11 6.5v6A1.5 1.5 0 0 1 9.5 14h-6A1.5 1.5 0 0 1 2 12.5v-6A1.5 1.5 0 0 1 3.5 5Z',
  check:         'm3 8.5 3.2 3.2L13 4.8',
  'chevron-left':'m10 3.5-5 4.5 5 4.5',
  cursor:        'm3 2.5 4.2 11 1.9-4.4 4.4-1.9L3 2.5Z',
  github:        'M6 12.8c-3 .9-3-1.5-4.2-1.8m8.4 4v-2.4a2 2 0 0 0-.6-1.6c1.9-.2 3.9-.9 3.9-4.2a3.3 3.3 0 0 0-.9-2.3 3 3 0 0 0-.1-2.3s-.7-.2-2.4.9a8.3 8.3 0 0 0-4.3 0C4.1 2 3.4 2.2 3.4 2.2a3 3 0 0 0-.1 2.3 3.3 3.3 0 0 0-.9 2.3c0 3.3 2 4 3.9 4.2a2 2 0 0 0-.6 1.5V15',
  mail:          'M2.5 4.5h11v7h-11v-7Zm0 .5 5.5 4 5.5-4',
  'check-square':'M2.5 8V4A1.5 1.5 0 0 1 4 2.5h8A1.5 1.5 0 0 1 13.5 4v8a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 12M4.5 8.3l2 2 4-4.6',
};

export function Icon({ name }: { readonly name: IconName }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path
        d={PATHS[name]}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={name === 'cursor' ? 'currentColor' : 'none'}
      />
    </svg>
  );
}
