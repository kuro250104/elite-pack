import type { AnchorHTMLAttributes, ReactNode } from "react";

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string | { pathname?: string }; children?: ReactNode };

/** Stand-in for next/link in Ladle: a plain anchor that never leaves the story. */
export default function Link({ href, children, ...props }: LinkProps) {
  const target = typeof href === "string" ? href : href.pathname ?? "#";
  return <a href={target} onClick={(event) => event.preventDefault()} {...props}>{children}</a>;
}
