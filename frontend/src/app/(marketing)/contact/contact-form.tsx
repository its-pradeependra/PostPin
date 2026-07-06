"use client";

import * as React from "react";
import { toast } from "sonner";
import { submitContactForm } from "@/lib/api/services/public";
import { ApiError } from "@/lib/api/errors";
import { site } from "@/lib/site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Icon } from "@/components/icons";

const VOLUME_OPTIONS = [
  { value: "lt-1k", label: "Less than 1,000 / month" },
  { value: "1k-10k", label: "1,000 – 10,000 / month" },
  { value: "10k-100k", label: "10,000 – 1,00,000 / month" },
  { value: "100k-plus", label: "1,00,000+ / month" },
] as const;

const INTEREST_OPTIONS = [
  { value: "sales", label: "Talk to sales" },
  { value: "support", label: "Get support" },
  { value: "partnership", label: "Partnership" },
] as const;

type Errors = Partial<Record<
  "name" | "email" | "company" | "volume" | "interest" | "message" | "consent",
  string
>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ContactForm() {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [volume, setVolume] = React.useState("");
  const [interest, setInterest] = React.useState("sales");
  const [message, setMessage] = React.useState("");
  const [consent, setConsent] = React.useState(false);
  const [honeypot, setHoneypot] = React.useState("");
  const [errors, setErrors] = React.useState<Errors>({});
  const [submitting, setSubmitting] = React.useState(false);

  function validate(): Errors {
    const next: Errors = {};
    const trimmedName = name.trim();
    const trimmedCompany = company.trim();
    const trimmedMessage = message.trim();

    if (trimmedName.length < 2 || trimmedName.length > 80) {
      next.name = "Please enter your name (2–80 characters).";
    }
    if (!EMAIL_RE.test(email.trim())) {
      next.email = "Enter a valid work email address.";
    }
    if (trimmedCompany.length < 2 || trimmedCompany.length > 120) {
      next.company = "Please enter your company (2–120 characters).";
    }
    if (!volume) {
      next.volume = "Select your monthly shipment volume.";
    }
    if (!interest) {
      next.interest = "Select what you'd like to talk about.";
    }
    if (trimmedMessage.length < 10 || trimmedMessage.length > 2000) {
      next.message = "Tell us a little more (10–2,000 characters).";
    }
    if (!consent) {
      next.consent = "Please agree to be contacted.";
    }
    return next;
  }

  function resetForm() {
    setName("");
    setEmail("");
    setCompany("");
    setVolume("");
    setInterest("sales");
    setMessage("");
    setConsent(false);
    setErrors({});
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // Anti-spam honeypot: silently succeed without revealing detection.
    if (honeypot) {
      toast.success("Thanks — we'll reply within 1 business day.");
      resetForm();
      return;
    }

    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) {
      const firstKey = Object.keys(next)[0];
      const el = document.querySelector<HTMLElement>(
        `[data-field="${firstKey}"]`,
      );
      el?.focus();
      toast.error("Please fix the highlighted fields.");
      return;
    }

    setSubmitting(true);
    const volumeLabel = VOLUME_OPTIONS.find((o) => o.value === volume)?.label ?? volume;
    const interestLabel = INTEREST_OPTIONS.find((o) => o.value === interest)?.label ?? interest;
    submitContactForm({
      name: name.trim(),
      email: email.trim(),
      company: company.trim() || undefined,
      topic: interestLabel,
      message: `${message.trim()}\n\n— Monthly volume: ${volumeLabel}`,
    })
      .then(() => {
        toast.success("Thanks — we'll reply within 1 business day.");
        resetForm();
      })
      .catch((err) => {
        toast.error(
          err instanceof ApiError && err.status === 429
            ? "Too many messages — please try again in a minute."
            : `Couldn't send your message right now. Please email us directly at ${site.supportEmail}.`,
        );
      })
      .finally(() => setSubmitting(false));
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="space-y-5"
      data-testid="contact-form"
    >
      {/* Honeypot — visually hidden, must stay empty */}
      <div aria-hidden className="absolute h-0 w-0 overflow-hidden">
        <label htmlFor="contact-company-url">Company website</label>
        <input
          id="contact-company-url"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          data-testid="contact-honeypot-input"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {/* Name */}
        <div className="space-y-1.5">
          <Label htmlFor="contact-name">Full name</Label>
          <Input
            id="contact-name"
            data-field="name"
            placeholder="Aarav Sharma"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!errors.name}
            disabled={submitting}
            data-testid="contact-name-input"
          />
          {errors.name && (
            <p className="text-xs text-destructive" role="alert">
              {errors.name}
            </p>
          )}
        </div>

        {/* Work email */}
        <div className="space-y-1.5">
          <Label htmlFor="contact-email">Work email</Label>
          <Input
            id="contact-email"
            data-field="email"
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!errors.email}
            disabled={submitting}
            data-testid="contact-email-input"
          />
          {errors.email && (
            <p className="text-xs text-destructive" role="alert">
              {errors.email}
            </p>
          )}
        </div>
      </div>

      {/* Company */}
      <div className="space-y-1.5">
        <Label htmlFor="contact-company">Company</Label>
        <Input
          id="contact-company"
          data-field="company"
          placeholder="FlipMart Technologies Pvt Ltd"
          autoComplete="organization"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          aria-invalid={!!errors.company}
          disabled={submitting}
          data-testid="contact-company-input"
        />
        {errors.company && (
          <p className="text-xs text-destructive" role="alert">
            {errors.company}
          </p>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {/* Monthly volume */}
        <div className="space-y-1.5">
          <Label htmlFor="contact-volume">Monthly shipment volume</Label>
          <Select
            value={volume}
            onValueChange={(v) => setVolume(v)}
            disabled={submitting}
          >
            <SelectTrigger
              id="contact-volume"
              data-field="volume"
              aria-invalid={!!errors.volume}
              data-testid="contact-volume-select"
            >
              <SelectValue placeholder="Select volume" />
            </SelectTrigger>
            <SelectContent>
              {VOLUME_OPTIONS.map((opt) => (
                <SelectItem
                  key={opt.value}
                  value={opt.value}
                  data-testid={`contact-volume-option-${opt.value}`}
                >
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.volume && (
            <p className="text-xs text-destructive" role="alert">
              {errors.volume}
            </p>
          )}
        </div>

        {/* Interest */}
        <div className="space-y-1.5">
          <Label htmlFor="contact-interest">What's this about?</Label>
          <Select
            value={interest}
            onValueChange={(v) => setInterest(v)}
            disabled={submitting}
          >
            <SelectTrigger
              id="contact-interest"
              data-field="interest"
              aria-invalid={!!errors.interest}
              data-testid="contact-interest-select"
            >
              <SelectValue placeholder="Select a topic" />
            </SelectTrigger>
            <SelectContent>
              {INTEREST_OPTIONS.map((opt) => (
                <SelectItem
                  key={opt.value}
                  value={opt.value}
                  data-testid={`contact-interest-option-${opt.value}`}
                >
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.interest && (
            <p className="text-xs text-destructive" role="alert">
              {errors.interest}
            </p>
          )}
        </div>
      </div>

      {/* Message */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="contact-message">How can we help?</Label>
          <span className="text-xs tabular-nums text-muted-foreground">
            {message.trim().length}/2000
          </span>
        </div>
        <Textarea
          id="contact-message"
          data-field="message"
          rows={5}
          placeholder="Tell us about your shipping volumes, the routes you cover, and what you'd like Postpin to price for you."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-invalid={!!errors.message}
          disabled={submitting}
          maxLength={2000}
          data-testid="contact-message-textarea"
        />
        {errors.message && (
          <p className="text-xs text-destructive" role="alert">
            {errors.message}
          </p>
        )}
      </div>

      {/* Consent */}
      <div className="space-y-1.5">
        <label
          htmlFor="contact-consent"
          className="flex cursor-pointer items-start gap-3 text-sm text-muted-foreground"
        >
          <Checkbox
            id="contact-consent"
            data-field="consent"
            checked={consent}
            onCheckedChange={(c) => setConsent(c === true)}
            disabled={submitting}
            className="mt-0.5"
            data-testid="contact-consent-checkbox"
          />
          <span>
            I agree to be contacted by Postpin about my enquiry and accept the{" "}
            <a href="/legal/privacy" className="text-primary underline-offset-2 hover:underline">
              privacy policy
            </a>
            .
          </span>
        </label>
        {errors.consent && (
          <p className="text-xs text-destructive" role="alert">
            {errors.consent}
          </p>
        )}
      </div>

      <Button
        type="submit"
        variant="gradient"
        size="lg"
        className="group w-full"
        disabled={submitting}
        data-testid="contact-submit-btn"
      >
        {submitting ? (
          <>
            <Icon name="sync" trigger="loop" animation="spin" size={17} className="text-white" />
            Sending…
          </>
        ) : (
          <>
            <Icon name="send" trigger="group-hover" size={17} className="text-white" />
            Send message
          </>
        )}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        We reply within 1 business day. No spam, ever.
      </p>
    </form>
  );
}
