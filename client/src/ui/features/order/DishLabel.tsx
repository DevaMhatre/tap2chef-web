type Props = { line: { name: string; portion?: string }; className?: string };

// A long name gives way; the portion never does. "Chicken Biryani Hyder… · Half"
// still tells the kitchen which plate.
export function DishLabel({ line, className = "" }: Props) {
  return (
    <span className={`flex min-w-0 ${className}`}>
      <span className="truncate">{line.name}</span>
      {line.portion !== undefined && <span className="shrink-0 pl-1 font-semibold">· {line.portion}</span>}
    </span>
  );
}
