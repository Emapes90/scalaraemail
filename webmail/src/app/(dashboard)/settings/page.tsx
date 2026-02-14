"use client";

import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Input";
import { PageLoader } from "@/components/ui/Loader";
import { Avatar } from "@/components/ui/Avatar";
import {
  User,
  Shield,
  Bell,
  Palette,
  Mail,
  Key,
  Save,
  RefreshCw,
  Server,
  Eye,
  EyeOff,
} from "lucide-react";

interface SettingsSection {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const sections: SettingsSection[] = [
  { id: "profile", label: "Profile", icon: <User className="h-4 w-4" /> },
  { id: "security", label: "Security", icon: <Shield className="h-4 w-4" /> },
  {
    id: "notifications",
    label: "Notifications",
    icon: <Bell className="h-4 w-4" />,
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: <Palette className="h-4 w-4" />,
  },
  { id: "mail", label: "Mail Settings", icon: <Mail className="h-4 w-4" /> },
  { id: "server", label: "Server", icon: <Server className="h-4 w-4" /> },
];

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState("profile");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [mailPasswordInput, setMailPasswordInput] = useState("");
  const [showMailPassword, setShowMailPassword] = useState(false);
  const [savingMailPassword, setSavingMailPassword] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.success) setSettings(data.data);
    } catch (e) {
      console.error("Failed to load settings:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      // Only send settings-relevant fields, not the whole user object
      const payload = {
        name: settings.name || null,
        signature: settings.signature || null,
        timezone: settings.timezone || "UTC",
        language: settings.language || "en",
        emailsPerPage: settings.emailsPerPage || 50,
        theme: settings.theme || "dark",
        notifications: settings.notifications ?? true,
        autoRefresh: settings.autoRefresh ?? 30,
      };

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: "Settings saved successfully" });
      } else {
        setMessage({ type: "error", text: data.error || "Failed to save" });
      }
    } catch (e) {
      setMessage({ type: "error", text: "Failed to save settings" });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setMessage({ type: "error", text: "Passwords do not match" });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: "Password changed successfully" });
        setPasswordForm({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
      } else {
        setMessage({
          type: "error",
          text: data.error || "Failed to change password",
        });
      }
    } catch (e) {
      setMessage({ type: "error", text: "Failed to change password" });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateMailPassword = async () => {
    if (!mailPasswordInput.trim()) {
      setMessage({ type: "error", text: "Please enter your mail password" });
      return;
    }
    setSavingMailPassword(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mailPassword: mailPasswordInput }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({
          type: "success",
          text: data.message || "Mail password updated successfully!",
        });
        setMailPasswordInput("");
      } else {
        setMessage({
          type: "error",
          text: data.error || "Failed to update mail password",
        });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to update mail password" });
    } finally {
      setSavingMailPassword(false);
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div className="flex h-full">
      {/* Settings Nav */}
      <div className="w-56 border-r border-scalara-border p-4">
        <div className="space-y-0.5">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                activeSection === section.id
                  ? "bg-white/10 text-white"
                  : "text-scalara-muted-foreground hover:text-white hover:bg-scalara-hover",
              )}
            >
              {section.icon}
              {section.label}
            </button>
          ))}
        </div>
      </div>

      {/* Settings Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
        <div className="max-w-2xl">
          {/* Message */}
          {message && (
            <div
              className={cn(
                "mb-6 p-3 rounded-lg text-sm animate-fade-in border",
                message.type === "success"
                  ? "bg-green-500/10 border-green-500/20 text-green-400"
                  : "bg-red-500/10 border-red-500/20 text-red-400",
              )}
            >
              {message.text}
            </div>
          )}

          {/* Profile Section */}
          {activeSection === "profile" && settings && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h2 className="text-xl font-semibold text-white mb-1">
                  Profile
                </h2>
                <p className="text-sm text-scalara-muted">
                  Manage your account information
                </p>
              </div>

              <div className="flex items-center gap-4 p-4 rounded-xl bg-scalara-surface border border-scalara-border">
                <Avatar name={settings.name || settings.email} size="lg" />
                <div>
                  <p className="text-sm font-medium text-white">
                    {settings.name || settings.email}
                  </p>
                  <p className="text-xs text-scalara-muted">{settings.email}</p>
                </div>
              </div>

              <div className="space-y-4">
                <Input
                  label="Display Name"
                  value={settings.name || ""}
                  onChange={(e) =>
                    setSettings({ ...settings, name: e.target.value })
                  }
                  placeholder="Your name"
                  icon={<User className="h-4 w-4" />}
                />

                <Input
                  label="Email"
                  value={settings.email}
                  disabled
                  icon={<Mail className="h-4 w-4" />}
                />

                <div>
                  <label className="block text-sm font-medium text-scalara-muted-foreground mb-1.5">
                    Timezone
                  </label>
                  <select
                    value={settings.timezone}
                    onChange={(e) =>
                      setSettings({ ...settings, timezone: e.target.value })
                    }
                    className="w-full h-10 rounded-lg bg-scalara-card border border-scalara-border px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/10"
                  >
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">Eastern Time</option>
                    <option value="America/Chicago">Central Time</option>
                    <option value="America/Denver">Mountain Time</option>
                    <option value="America/Los_Angeles">Pacific Time</option>
                    <option value="Europe/London">London</option>
                    <option value="Europe/Paris">Paris</option>
                    <option value="Asia/Kolkata">India (IST)</option>
                    <option value="Asia/Tokyo">Tokyo</option>
                    <option value="Asia/Shanghai">Shanghai</option>
                  </select>
                </div>

                <Textarea
                  label="Email Signature"
                  value={settings.signature || ""}
                  onChange={(e) =>
                    setSettings({ ...settings, signature: e.target.value })
                  }
                  placeholder="Your email signature..."
                  rows={4}
                />
              </div>

              <Button
                onClick={handleSave}
                loading={saving}
                icon={<Save className="h-4 w-4" />}
              >
                Save Profile
              </Button>
            </div>
          )}

          {/* Security Section */}
          {activeSection === "security" && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h2 className="text-xl font-semibold text-white mb-1">
                  Security
                </h2>
                <p className="text-sm text-scalara-muted">
                  Manage your password and security settings
                </p>
              </div>

              <div className="p-6 rounded-xl bg-scalara-surface border border-scalara-border space-y-4">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Key className="h-4 w-4" /> Change Password
                </h3>

                <Input
                  label="Current Password"
                  type={showPassword ? "text" : "password"}
                  value={passwordForm.currentPassword}
                  onChange={(e) =>
                    setPasswordForm({
                      ...passwordForm,
                      currentPassword: e.target.value,
                    })
                  }
                  placeholder="Enter current password"
                  iconRight={
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      className="hover:text-white transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  }
                />

                <Input
                  label="New Password"
                  type={showPassword ? "text" : "password"}
                  value={passwordForm.newPassword}
                  onChange={(e) =>
                    setPasswordForm({
                      ...passwordForm,
                      newPassword: e.target.value,
                    })
                  }
                  placeholder="Enter new password (min 8 chars)"
                />

                <Input
                  label="Confirm New Password"
                  type={showPassword ? "text" : "password"}
                  value={passwordForm.confirmPassword}
                  onChange={(e) =>
                    setPasswordForm({
                      ...passwordForm,
                      confirmPassword: e.target.value,
                    })
                  }
                  placeholder="Confirm new password"
                  error={
                    passwordForm.confirmPassword &&
                    passwordForm.newPassword !== passwordForm.confirmPassword
                      ? "Passwords do not match"
                      : undefined
                  }
                />

                <Button
                  onClick={handleChangePassword}
                  loading={saving}
                  variant="secondary"
                >
                  Update Password
                </Button>
                <p className="text-xs text-scalara-muted mt-2">
                  This changes your webmail login only. To update your SMTP/IMAP
                  password, ask your admin to run the password change on the
                  server, then re-enter it in Settings → Server → Mail Password.
                </p>
              </div>

              <div className="p-6 rounded-xl bg-scalara-surface border border-scalara-border">
                <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                  <Shield className="h-4 w-4" /> Active Sessions
                </h3>
                <p className="text-sm text-scalara-muted mb-3">
                  Last login:{" "}
                  {settings?.lastLoginAt
                    ? new Date(settings.lastLoginAt).toLocaleString()
                    : "N/A"}
                </p>
                <Button variant="danger" size="sm">
                  Sign Out All Devices
                </Button>
              </div>
            </div>
          )}

          {/* Notifications Section */}
          {activeSection === "notifications" && settings && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h2 className="text-xl font-semibold text-white mb-1">
                  Notifications
                </h2>
                <p className="text-sm text-scalara-muted">
                  Configure how you receive notifications
                </p>
              </div>

              <div className="space-y-3">
                {[
                  {
                    key: "notifications",
                    label: "Email Notifications",
                    description: "Receive desktop notifications for new emails",
                  },
                ].map(({ key, label, description }) => (
                  <div
                    key={key}
                    className="flex items-center justify-between p-4 rounded-xl bg-scalara-surface border border-scalara-border"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">{label}</p>
                      <p className="text-xs text-scalara-muted">
                        {description}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        setSettings({ ...settings, [key]: !settings[key] })
                      }
                      className={cn(
                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                        settings[key] ? "bg-white" : "bg-scalara-card",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block h-4 w-4 transform rounded-full transition-transform",
                          settings[key]
                            ? "translate-x-6 bg-black"
                            : "translate-x-1 bg-scalara-muted",
                        )}
                      />
                    </button>
                  </div>
                ))}

                <div className="p-4 rounded-xl bg-scalara-surface border border-scalara-border">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-medium text-white flex items-center gap-2">
                        <RefreshCw className="h-4 w-4" /> Auto Refresh
                      </p>
                      <p className="text-xs text-scalara-muted">
                        Check for new emails automatically
                      </p>
                    </div>
                  </div>
                  <select
                    value={settings.autoRefresh}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        autoRefresh: parseInt(e.target.value),
                      })
                    }
                    className="w-full h-10 rounded-lg bg-scalara-card border border-scalara-border px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/10"
                  >
                    <option value="0">Disabled</option>
                    <option value="15">Every 15 seconds</option>
                    <option value="30">Every 30 seconds</option>
                    <option value="60">Every 1 minute</option>
                    <option value="120">Every 2 minutes</option>
                    <option value="300">Every 5 minutes</option>
                  </select>
                </div>
              </div>

              <Button
                onClick={handleSave}
                loading={saving}
                icon={<Save className="h-4 w-4" />}
              >
                Save Notifications
              </Button>
            </div>
          )}

          {/* Appearance Section */}
          {activeSection === "appearance" && settings && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h2 className="text-xl font-semibold text-white mb-1">
                  Appearance
                </h2>
                <p className="text-sm text-scalara-muted">
                  Customize the look and feel
                </p>
              </div>

              <div className="p-4 rounded-xl bg-scalara-surface border border-scalara-border">
                <p className="text-sm font-medium text-white mb-3">Theme</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    {
                      id: "dark",
                      label: "Dark",
                      colors: ["#0a0a0a", "#111111", "#ffffff"],
                    },
                    {
                      id: "midnight",
                      label: "Midnight",
                      colors: ["#0f172a", "#1e293b", "#f8fafc"],
                    },
                    {
                      id: "charcoal",
                      label: "Charcoal",
                      colors: ["#18181b", "#27272a", "#fafafa"],
                    },
                  ].map((theme) => (
                    <button
                      key={theme.id}
                      onClick={() =>
                        setSettings({ ...settings, theme: theme.id })
                      }
                      className={cn(
                        "p-3 rounded-xl border-2 transition-all",
                        settings.theme === theme.id
                          ? "border-white"
                          : "border-scalara-border hover:border-scalara-muted",
                      )}
                    >
                      <div className="flex gap-1 mb-2">
                        {theme.colors.map((c, i) => (
                          <div
                            key={i}
                            className="h-4 flex-1 rounded"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-center text-scalara-muted-foreground">
                        {theme.label}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-scalara-surface border border-scalara-border">
                <p className="text-sm font-medium text-white mb-3">
                  Emails Per Page
                </p>
                <select
                  value={settings.emailsPerPage}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      emailsPerPage: parseInt(e.target.value),
                    })
                  }
                  className="w-full h-10 rounded-lg bg-scalara-card border border-scalara-border px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/10"
                >
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="75">75</option>
                  <option value="100">100</option>
                </select>
              </div>

              <Button
                onClick={handleSave}
                loading={saving}
                icon={<Save className="h-4 w-4" />}
              >
                Save Appearance
              </Button>
            </div>
          )}

          {/* Mail Settings */}
          {activeSection === "mail" && settings && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h2 className="text-xl font-semibold text-white mb-1">
                  Mail Settings
                </h2>
                <p className="text-sm text-scalara-muted">
                  Configure email behavior
                </p>
              </div>

              <div className="p-4 rounded-xl bg-scalara-surface border border-scalara-border">
                <p className="text-sm font-medium text-white mb-3">
                  Default Reply Behavior
                </p>
                <select className="w-full h-10 rounded-lg bg-scalara-card border border-scalara-border px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/10">
                  <option value="reply">Reply</option>
                  <option value="reply-all">Reply All</option>
                </select>
              </div>

              <div className="p-4 rounded-xl bg-scalara-surface border border-scalara-border">
                <p className="text-sm font-medium text-white mb-3">Language</p>
                <select
                  value={settings.language}
                  onChange={(e) =>
                    setSettings({ ...settings, language: e.target.value })
                  }
                  className="w-full h-10 rounded-lg bg-scalara-card border border-scalara-border px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/10"
                >
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="ja">Japanese</option>
                  <option value="zh">Chinese</option>
                </select>
              </div>

              <Button
                onClick={handleSave}
                loading={saving}
                icon={<Save className="h-4 w-4" />}
              >
                Save Mail Settings
              </Button>
            </div>
          )}

          {/* Server Section */}
          {activeSection === "server" && settings && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h2 className="text-xl font-semibold text-white mb-1">
                  Server Configuration
                </h2>
                <p className="text-sm text-scalara-muted">
                  Your mail server details (read-only)
                </p>
              </div>

              <div className="p-6 rounded-xl bg-scalara-surface border border-scalara-border space-y-4">
                <h3 className="text-sm font-semibold text-white mb-2">
                  IMAP (Incoming)
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Host"
                    value={settings.imapHost}
                    disabled
                    icon={<Server className="h-4 w-4" />}
                  />
                  <Input
                    label="Port"
                    value={String(settings.imapPort)}
                    disabled
                  />
                </div>
              </div>

              <div className="p-6 rounded-xl bg-scalara-surface border border-scalara-border space-y-4">
                <h3 className="text-sm font-semibold text-white mb-2">
                  SMTP (Outgoing)
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Host"
                    value={settings.smtpHost}
                    disabled
                    icon={<Server className="h-4 w-4" />}
                  />
                  <Input
                    label="Port"
                    value={String(settings.smtpPort)}
                    disabled
                  />
                </div>
              </div>

              {/* Mail Password Update */}
              <div className="p-6 rounded-xl bg-scalara-surface border border-scalara-border space-y-4">
                <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
                  <Key className="h-4 w-4" /> Mail Server Password
                </h3>
                <p className="text-xs text-scalara-muted">
                  If you&apos;re getting &quot;SMTP authentication failed&quot;,
                  re-enter the same password that was used when your email
                  account was created by the admin.
                </p>
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <Input
                      label="Mail Password"
                      type={showMailPassword ? "text" : "password"}
                      value={mailPasswordInput}
                      onChange={(e) => setMailPasswordInput(e.target.value)}
                      placeholder="Enter your mail server password"
                      iconRight={
                        <button
                          onClick={() => setShowMailPassword(!showMailPassword)}
                          className="hover:text-white transition-colors"
                        >
                          {showMailPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      }
                    />
                  </div>
                  <Button
                    onClick={handleUpdateMailPassword}
                    loading={savingMailPassword}
                    variant="secondary"
                    icon={<Save className="h-4 w-4" />}
                  >
                    Update
                  </Button>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-scalara-card border border-scalara-border">
                <p className="text-xs text-scalara-muted">
                  Server settings are managed by your administrator via the
                  Scalara installer. Contact your admin to make changes.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
