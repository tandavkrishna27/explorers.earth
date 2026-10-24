// The image-upload control the add pages share: the dashed button Movies uses, drawn with
// the dashboard theme tokens so it reads in both themes. The native file input sits inside
// it as sr-only, so the label text stays the input's accessible name.
export const uploadButton =
  "flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 self-start rounded-xl border border-dashed border-dashboard-border bg-dashboard-muted px-5 py-3 text-sm text-dashboard transition-colors focus-within:ring-2 focus-within:ring-blue-500 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 md:w-auto";
