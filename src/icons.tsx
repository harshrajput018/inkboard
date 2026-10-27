const paths: Record<string, React.ReactNode> = {
  select: <path d="M5 3l14 8-6 1.5L10 19z" />,
  hand: <path d="M8 13V5.5a1.5 1.5 0 013 0V11m0-6.5a1.5 1.5 0 013 0V11m0-5a1.5 1.5 0 013 0v7a7 7 0 01-7 7h-.5a6 6 0 01-5-2.7L3.3 13.8a1.5 1.5 0 012.4-1.8L8 14" />,
  rect: <rect x="4" y="5" width="16" height="14" rx="2" />,
  ellipse: <ellipse cx="12" cy="12" rx="8.5" ry="6.5" />,
  diamond: <path d="M12 3l9 9-9 9-9-9z" />,
  arrow: <path d="M5 19L19 5m0 0h-8m8 0v8" />,
  line: <path d="M5 19L19 5" />,
  pen: <path d="M4 20c3-1 4-4 6-7s5-6 7-5-1 5-4 7-6 2-6 5" />,
  text: <path d="M5 6V4h14v2M12 4v16m-3 0h6" />,
  sticky: <path d="M5 4h14v10l-6 6H5zM13 20v-6h6" />,
  eraser: <path d="M8 20h12M4.5 15.5l9-9a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8l-7 7H8z" />,
  undo: <path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3" />,
  redo: <path d="M15 14l5-5-5-5m5 5H10a6 6 0 000 12h3" />,
  minus: <path d="M5 12h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  fit: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  trash: <path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  copy: <path d="M9 9h11v11H9zM5 15H4V4h11v1" />,
  front: <path d="M8 8h12v12H8zM4 16V4h12" />,
  back: <path d="M4 4h12v12H4zM20 8v12H8" />,
  download: <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" />,
  link: <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />,
  tab: <path d="M4 6h16v14H4zM4 10h16M14 3v3" />,
};

export function Icon({ name, className = "h-[18px] w-[18px]" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
