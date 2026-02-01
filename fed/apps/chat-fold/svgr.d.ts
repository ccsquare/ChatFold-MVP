declare module "*.svg?react" {
  import type { FunctionComponent, SVGProps } from "react";

  const content: FunctionComponent<SVGProps<SVGElement>>;

  export default content;
}

declare module "*.svg?url" {
  import type { StaticImageData } from "next/image";

  const content: StaticImageData;

  export default content;
}
