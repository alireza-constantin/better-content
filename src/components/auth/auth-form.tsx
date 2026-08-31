"use client";

import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth/client";
import {
  getAuthenticationErrorMessage,
  validateAuthInput,
  type AuthErrorMessageKey,
  type AuthFormErrors,
} from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

type AuthMode = "sign-in" | "sign-up";

type AuthFormProps = Readonly<{
  mode: AuthMode;
}>;

type FormValues = {
  name: string;
  email: string;
  password: string;
};

const emptyValues: FormValues = {
  name: "",
  email: "",
  password: "",
};

function getFieldErrorId(field: keyof FormValues): string {
  return `auth-${field}-error`;
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const t = useTranslations("Auth");
  const [values, setValues] = useState(emptyValues);
  const [fieldErrors, setFieldErrors] = useState<AuthFormErrors>({});
  const [formError, setFormError] = useState<AuthErrorMessageKey>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const isSignUp = mode === "sign-up";

  function updateValue(field: keyof FormValues, value: string) {
    setValues((currentValues) => ({ ...currentValues, [field]: value }));
    setFieldErrors((currentErrors) => ({ ...currentErrors, [field]: undefined }));
    setFormError(undefined);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedValues = {
      ...values,
      email: values.email.trim(),
      name: values.name.trim(),
    };
    const validationErrors = validateAuthInput(mode, normalizedValues);

    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      const firstInvalidInput = validationErrors.name
        ? nameInputRef.current
        : validationErrors.email
          ? emailInputRef.current
          : passwordInputRef.current;

      firstInvalidInput?.focus();
      return;
    }

    setIsSubmitting(true);
    setFormError(undefined);

    try {
      const result = isSignUp
        ? await authClient.signUp.email({
            name: normalizedValues.name,
            email: normalizedValues.email,
            password: normalizedValues.password,
          })
        : await authClient.signIn.email({
            email: normalizedValues.email,
            password: normalizedValues.password,
          });

      if (result.error) {
        setFormError(getAuthenticationErrorMessage(mode, result.error));
        return;
      }

      router.replace("/dashboard");
    } catch {
      setFormError(getAuthenticationErrorMessage(mode, undefined));
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputClassName =
    "mt-2 h-11 w-full rounded-lg border bg-background px-3 text-base shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <form aria-busy={isSubmitting} className="space-y-5" noValidate onSubmit={handleSubmit}>
      {isSignUp ? (
        <div>
          <label className="text-sm font-medium text-foreground" htmlFor="auth-name">
            {t("nameLabel")}
          </label>
          <input
            aria-describedby={fieldErrors.name ? getFieldErrorId("name") : undefined}
            aria-invalid={Boolean(fieldErrors.name)}
            autoComplete="name"
            className={inputClassName}
            disabled={isSubmitting}
            id="auth-name"
            name="name"
            onChange={(event) => updateValue("name", event.target.value)}
            ref={nameInputRef}
            type="text"
            value={values.name}
          />
          {fieldErrors.name ? (
            <p className="mt-2 text-sm text-destructive" id={getFieldErrorId("name")} role="alert">
              {t("invalidName")}
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <label className="text-sm font-medium text-foreground" htmlFor="auth-email">
          {t("emailLabel")}
        </label>
        <input
          aria-describedby={fieldErrors.email ? getFieldErrorId("email") : undefined}
          aria-invalid={Boolean(fieldErrors.email)}
          autoComplete="email"
          className={inputClassName}
          dir="ltr"
          disabled={isSubmitting}
          id="auth-email"
          inputMode="email"
          name="email"
          onChange={(event) => updateValue("email", event.target.value)}
          ref={emailInputRef}
          spellCheck={false}
          type="email"
          value={values.email}
        />
        {fieldErrors.email ? (
          <p className="mt-2 text-sm text-destructive" id={getFieldErrorId("email")} role="alert">
            {t("invalidEmail")}
          </p>
        ) : null}
      </div>

      <div>
        <label className="text-sm font-medium text-foreground" htmlFor="auth-password">
          {t("passwordLabel")}
        </label>
        <input
          aria-describedby={
            fieldErrors.password ? getFieldErrorId("password") : "auth-password-hint"
          }
          aria-invalid={Boolean(fieldErrors.password)}
          autoComplete={isSignUp ? "new-password" : "current-password"}
          className={inputClassName}
          dir="ltr"
          disabled={isSubmitting}
          id="auth-password"
          name="password"
          onChange={(event) => updateValue("password", event.target.value)}
          ref={passwordInputRef}
          type="password"
          value={values.password}
        />
        {fieldErrors.password ? (
          <p
            className="mt-2 text-sm text-destructive"
            id={getFieldErrorId("password")}
            role="alert"
          >
            {t("password")}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground" id="auth-password-hint">
            {t("passwordHint")}
          </p>
        )}
      </div>

      {formError ? (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {t(formError)}
        </p>
      ) : null}

      <Button className="h-11 w-full" disabled={isSubmitting} type="submit">
        {isSubmitting ? t("submitting") : isSignUp ? t("signUpAction") : t("signInAction")}
      </Button>
    </form>
  );
}
