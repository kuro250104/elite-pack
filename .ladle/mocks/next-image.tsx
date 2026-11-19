import type { ImgHTMLAttributes } from "react";

type ImageProps = ImgHTMLAttributes<HTMLImageElement> & { src: string; alt: string; fill?: boolean; priority?: boolean };

/** Stand-in for next/image in Ladle: a plain image without optimisation. */
export default function Image({ fill, priority, alt, ...props }: ImageProps) {
  void priority;
  // eslint-disable-next-line @next/next/no-img-element -- Ladle runs outside Next.js.
  return <img alt={alt} {...props} style={fill ? { objectFit: "cover", width: "100%", height: "100%" } : props.style} />;
}
