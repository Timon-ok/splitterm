// A shell profile the user can launch. The renderer only needs id + label; the host keeps the
// executable/args internal. Full profile management (custom profiles, icons, env) lands in M3.
export interface ShellProfile {
  id: string;
  label: string;
}
