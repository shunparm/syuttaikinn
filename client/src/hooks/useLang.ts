import { useState } from "react";

export type Lang = "ja" | "id";

export function useLang() {
  const [lang, setLang] = useState<Lang>(
    () => (localStorage.getItem("lang") as Lang) ?? "ja"
  );
  const toggle = () => {
    const next: Lang = lang === "ja" ? "id" : "ja";
    localStorage.setItem("lang", next);
    setLang(next);
  };
  return { lang, toggle, t: (ja: string, id: string) => lang === "ja" ? ja : id };
}
