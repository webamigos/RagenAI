// The last of the kit. `button` is imported by subpath at three call sites and
// nothing goes through this barrel, which is why it no longer exports anything
// but the one file left.
export { type ButtonProps, Button, TouchTarget } from './button';
