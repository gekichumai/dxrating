import "react";

declare module "react" {
  interface HTMLAttributes<T> extends AriaAttributes, DOMAttributes<T> {
    // extends React
    tw?: string;
  }
}

declare global {
  interface Document {
    startViewTransition(cb: () => Promise<void> | void): ViewTransition;
  }
}
