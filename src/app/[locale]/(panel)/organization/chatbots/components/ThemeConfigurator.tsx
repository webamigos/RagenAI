'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import type { ChatbotThemeConfig } from '@/features/chatbots/contracts/chatbot.types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

type ThemeConfiguratorProps = {
  value: ChatbotThemeConfig;
  onChange: (value: ChatbotThemeConfig) => void;
  chatbotId: string;
};

function ColorField({
  id,
  label,
  colorKey,
  value,
  onChange,
}: {
  id: string;
  label: string;
  colorKey: 'primaryColor' | 'bubbleColor';
  value: ChatbotThemeConfig;
  onChange: (value: ChatbotThemeConfig) => void;
}) {
  const t = useTranslations('settings-page.chatbots.theme');
  const resolved = value[colorKey] ?? '#6366f1';
  const [hexInput, setHexInput] = useState(resolved);
  const [hexError, setHexError] = useState(false);

  useEffect(() => {
    setHexInput(resolved);
    setHexError(false);
  }, [resolved]);

  const commitHex = (raw: string) => {
    const hex = raw.startsWith('#') ? raw : `#${raw}`;
    if (HEX_RE.test(hex)) {
      setHexError(false);
      onChange({ ...value, [colorKey]: hex });
    } else {
      setHexError(true);
    }
  };

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs text-zinc-600 dark:text-zinc-400">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={resolved}
          onChange={(e) => {
            setHexInput(e.target.value);
            setHexError(false);
            onChange({ ...value, [colorKey]: e.target.value });
          }}
          className="size-8 cursor-pointer rounded border border-zinc-300 dark:border-zinc-700"
        />
        <div className="relative">
          <input
            type="text"
            value={hexInput}
            maxLength={7}
            onChange={(e) => setHexInput(e.target.value)}
            onBlur={(e) => commitHex(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitHex((e.target as HTMLInputElement).value);
              }
            }}
            className={`w-24 rounded border px-2 py-0.5 font-mono text-xs focus:outline-none focus:ring-2 ${
              hexError
                ? 'border-red-400 text-red-600 focus:ring-red-400 dark:border-red-500 dark:text-red-400'
                : 'border-zinc-300 text-zinc-700 focus:ring-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:focus:ring-zinc-300'
            }`}
          />
          {hexError && (
            <span className="absolute left-0 top-full mt-0.5 text-xs text-red-500">
              {t('hex-hint')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

async function getCroppedBlob(
  imageSrc: string,
  croppedAreaPixels: Area,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = croppedAreaPixels.width;
      canvas.height = croppedAreaPixels.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }
      ctx.drawImage(
        image,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
        0,
        0,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
      );
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Canvas toBlob failed'));
          }
        },
        'image/webp',
        0.9,
      );
    };
    image.onerror = reject;
    image.src = imageSrc;
  });
}

export function ThemeConfigurator({
  value,
  onChange,
  chatbotId,
}: ThemeConfiguratorProps) {
  const t = useTranslations('settings-page.chatbots.theme');

  const [questionIds, setQuestionIds] = useState<string[]>(() =>
    (value.starterQuestions ?? []).map(() => crypto.randomUUID()),
  );

  useEffect(() => {
    setQuestionIds((prev) => {
      const len = value.starterQuestions?.length ?? 0;
      if (prev.length === len) {
        return prev;
      }
      if (prev.length < len) {
        return [
          ...prev,
          ...Array.from({ length: len - prev.length }, () =>
            crypto.randomUUID(),
          ),
        ];
      }
      return prev.slice(0, len);
    });
  }, [value.starterQuestions?.length]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [avatarRemoving, setAvatarRemoving] = useState(false);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      e.target.value = '';
      setUploadError('avatar-uploading-error');
      return;
    }
    setUploadError(null);
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCropSave = async () => {
    if (!cropSrc || !croppedAreaPixels) {
      return;
    }
    setAvatarUploading(true);
    setUploadError(null);
    try {
      const blob = await getCroppedBlob(cropSrc, croppedAreaPixels);
      const formData = new FormData();
      formData.append('file', blob, 'avatar.webp');
      const res = await fetch(`/api/chatbots/${chatbotId}/avatar`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        throw new Error('Upload failed');
      }
      const { avatarUrl } = await res.json();
      onChange({ ...value, avatarUrl });
      setCropSrc(null);
    } catch {
      setUploadError('upload-error');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleAvatarRemove = async () => {
    setAvatarRemoving(true);
    try {
      const res = await fetch(`/api/chatbots/${chatbotId}/avatar`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const { avatarUrl: _removed, ...rest } = value;
        onChange(rest);
      }
    } catch {
      // silent — button re-enables so user can retry
    } finally {
      setAvatarRemoving(false);
    }
  };

  const update = (key: keyof ChatbotThemeConfig, val: string | string[]) => {
    if (Array.isArray(val)) {
      onChange({ ...value, [key]: val });
      return;
    }
    onChange({ ...value, [key]: val || undefined });
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-zinc-950 dark:text-white">
        {t('title')}
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {/* Primary color */}
        <ColorField
          id="theme-primary-color"
          label={t('primary-color')}
          colorKey="primaryColor"
          value={value}
          onChange={onChange}
        />

        {/* Bubble color */}
        <ColorField
          id="theme-bubble-color"
          label={t('bubble-color')}
          colorKey="bubbleColor"
          value={value}
          onChange={onChange}
        />

        {/* Position */}
        <div className="space-y-1.5">
          <label
            htmlFor="theme-position"
            className="text-xs text-zinc-600 dark:text-zinc-400"
          >
            {t('position')}
          </label>
          <select
            id="theme-position"
            value={value.position ?? 'right'}
            onChange={(e) => update('position', e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:ring-zinc-300"
          >
            <option value="right">{t('position-right')}</option>
            <option value="left">{t('position-left')}</option>
          </select>
        </div>

        {/* Bot name */}
        <div className="space-y-1.5">
          <label
            htmlFor="theme-bot-name"
            className="text-xs text-zinc-600 dark:text-zinc-400"
          >
            {t('bot-name')}
          </label>
          <input
            id="theme-bot-name"
            type="text"
            value={value.botName ?? ''}
            onChange={(e) => update('botName', e.target.value)}
            placeholder={t('bot-name-placeholder')}
            className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-950 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-500 dark:focus:ring-zinc-300"
          />
        </div>
      </div>

      {/* Welcome message */}
      <div className="space-y-1.5">
        <label
          htmlFor="theme-welcome-message"
          className="text-xs text-zinc-600 dark:text-zinc-400"
        >
          {t('welcome-message')}
        </label>
        <input
          id="theme-welcome-message"
          type="text"
          value={value.welcomeMessage ?? ''}
          onChange={(e) => update('welcomeMessage', e.target.value)}
          placeholder={t('welcome-message-placeholder')}
          className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-950 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-500 dark:focus:ring-zinc-300"
        />
      </div>

      {/* Starter questions */}
      <div className="space-y-2">
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          {t('starter-questions')}
        </p>
        {(value.starterQuestions ?? []).map((q, i) => (
          <div key={questionIds[i] ?? i} className="flex items-center gap-2">
            <input
              type="text"
              value={q}
              maxLength={100}
              onChange={(e) => {
                const next = [...(value.starterQuestions ?? [])];
                next[i] = e.target.value;
                update('starterQuestions', next);
              }}
              placeholder={t('starter-questions-placeholder')}
              className="flex-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-950 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-500 dark:focus:ring-zinc-300"
            />
            <button
              type="button"
              aria-label={`${t('starter-questions-remove')} ${i + 1}`}
              onClick={() => {
                setQuestionIds((ids) => ids.filter((_, j) => j !== i));
                const next = (value.starterQuestions ?? []).filter(
                  (_, j) => j !== i,
                );
                update('starterQuestions', next);
              }}
              className="flex size-7 items-center justify-center rounded-md border border-zinc-300 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-300"
            >
              ×
            </button>
          </div>
        ))}
        {(value.starterQuestions ?? []).length < 5 && (
          <button
            type="button"
            onClick={() => {
              setQuestionIds((ids) => [...ids, crypto.randomUUID()]);
              update('starterQuestions', [
                ...(value.starterQuestions ?? []),
                '',
              ]);
            }}
            className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
          >
            + {t('starter-questions-add')}
          </button>
        )}
      </div>

      {/* Avatar */}
      <div className="space-y-2">
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          {t('avatar')}
        </p>
        <div className="flex items-center gap-3">
          {value.avatarUrl ? (
            <img
              src={value.avatarUrl}
              alt=""
              className="size-12 rounded-full object-cover border border-zinc-200 dark:border-zinc-700"
            />
          ) : (
            <div
              className="size-12 rounded-full flex items-center justify-center text-white text-lg font-bold"
              style={{ background: value.primaryColor ?? '#6366f1' }}
            >
              {(value.botName ?? 'A').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
            >
              {t('avatar-change')}
            </button>
            {value.avatarUrl && (
              <button
                type="button"
                onClick={handleAvatarRemove}
                disabled={avatarRemoving}
                className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
              >
                {t('avatar-remove')}
              </button>
            )}
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
        {uploadError && !cropSrc && (
          <p className="text-xs text-red-500">{t('avatar-uploading-error')}</p>
        )}
      </div>

      {/* Crop modal */}
      <Dialog
        open={!!cropSrc}
        onOpenChange={(open) => {
          if (!open) {
            setCropSrc(null);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('avatar-crop-title')}</DialogTitle>
          </DialogHeader>
          <div className="relative h-64 w-full bg-zinc-100 dark:bg-zinc-800 rounded-md overflow-hidden">
            {cropSrc && (
              <Cropper
                image={cropSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            )}
          </div>
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full"
          />
          <DialogFooter>
            {uploadError && (
              <p className="text-xs text-red-500 mr-auto">
                {t('avatar-uploading-error')}
              </p>
            )}
            <button
              type="button"
              onClick={() => setCropSrc(null)}
              className="px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700"
            >
              {t('avatar-crop-cancel')}
            </button>
            <button
              type="button"
              onClick={handleCropSave}
              disabled={avatarUploading}
              className="px-3 py-1.5 text-sm rounded-md bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 disabled:opacity-50"
            >
              {avatarUploading ? t('avatar-uploading') : t('avatar-crop-save')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
