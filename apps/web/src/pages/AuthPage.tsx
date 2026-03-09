import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import { useToast } from "../lib/toast";

export default function AuthPage() {
    const { push } = useToast();
    const [mode, setMode] = useState<"signin" | "signup">("signup");
    const [loading, setLoading] = useState(false);
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (mode === "signup") {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            first_name: firstName,
                            last_name: lastName
                        }
                    }
                });
                if (error) throw error;
                push("Check your email for the confirmation link!", "success");
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
                push("Welcome back!", "success");
            }
        } catch (err: any) {
            push(err.message, "error");
        } finally {
            setLoading(false);
        }
    };

    const handleOAuth = async (provider: "google" | "github") => {
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider,
                options: {
                    redirectTo: window.location.origin
                }
            });
            if (error) throw error;
        } catch (err: any) {
            push(err.message, "error");
        }
    };

    return (
        <div className="min-h-screen flex bg-[#0A0A0A] text-white">
            {/* Left Side - The Mood Panel */}
            <div className="hidden lg:flex flex-col flex-1 relative overflow-hidden bg-black m-4 rounded-[40px] border border-white/5 shadow-2xl">
                {/* Visual Gradient Background */}
                <div
                    className="absolute inset-0 z-0 opacity-40"
                    style={{
                        background: `radial-gradient(circle at 50% 50%, #7C3AED 0%, #000000 70%)`
                    }}
                />

                <div className="relative z-10 flex flex-col h-full p-16">
                    <div className="flex items-center gap-3 mb-24">
                        <div className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center">
                            <div className="w-2 h-2 rounded-full bg-white" />
                        </div>
                        <span className="font-bold text-xl tracking-tight">Linkra</span>
                    </div>

                    <div className="max-w-md">
                        <h1 className="text-6xl font-bold tracking-tight mb-6 leading-[1.1]">Get Started with Us</h1>
                        <p className="text-lg text-white/50 mb-12">Complete these easy steps to register your account.</p>

                        <div className="space-y-4">
                            <Step item="1" text="Sign up your account" active />
                            <Step item="2" text="Set up your workspace" />
                            <Step item="3" text="Set up your profile" />
                        </div>
                    </div>

                    <div className="mt-auto text-sm text-white/20">
                        &copy; 2026 Linkra Inc. All rights reserved.
                    </div>
                </div>
            </div>

            {/* Right Side - The Form Section */}
            <div className="flex-[1.2] flex flex-col items-center justify-center p-8 lg:p-24 bg-[#0A0A0A]">
                <div className="w-full max-w-[420px]">
                    <div className="mb-10">
                        <h2 className="text-3xl font-bold mb-3">{mode === "signup" ? "Sign Up Account" : "Welcome Back"}</h2>
                        <p className="text-white/40">{mode === "signup" ? "Enter your personal data to create your account." : "Enter your credentials to access your workspace."}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-8">
                        <SocialButton icon="google" label="Google" onClick={() => handleOAuth("google")} />
                        <SocialButton icon="github" label="GitHub" onClick={() => handleOAuth("github")} />
                    </div>

                    <div className="relative flex items-center gap-4 mb-8 text-white/20">
                        <div className="h-px flex-1 bg-white/10" />
                        <span className="text-xs font-medium uppercase tracking-widest">Or</span>
                        <div className="h-px flex-1 bg-white/10" />
                    </div>

                    <form onSubmit={handleAuth} className="space-y-6">
                        {mode === "signup" && (
                            <div className="grid grid-cols-2 gap-4">
                                <FormInput
                                    label="First Name"
                                    placeholder="eg. John"
                                    value={firstName}
                                    onChange={setFirstName}
                                />
                                <FormInput
                                    label="Last Name"
                                    placeholder="eg. Francisco"
                                    value={lastName}
                                    onChange={setLastName}
                                />
                            </div>
                        )}

                        <FormInput
                            label="Email"
                            type="email"
                            placeholder="eg. johnfrans@gmail.com"
                            value={email}
                            onChange={setEmail}
                            required
                        />

                        <div className="relative">
                            <FormInput
                                label="Password"
                                type={showPassword ? "text" : "password"}
                                placeholder="Enter your password"
                                value={password}
                                onChange={setPassword}
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 bottom-4 text-white/30 hover:text-white/60"
                            >
                                {showPassword ? (
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                    </svg>
                                ) : (
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                )}
                            </button>
                        </div>
                        {mode === "signup" && <p className="text-xs text-white/40">Must be at least 8 characters.</p>}

                        <button
                            disabled={loading}
                            type="submit"
                            className="w-full py-4 rounded-xl bg-white text-black font-bold hover:bg-white/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100"
                        >
                            {loading ? "Please wait..." : (mode === "signup" ? "Sign Up" : "Log In")}
                        </button>
                    </form>

                    <div className="mt-8 text-center text-sm">
                        <span className="text-white/40">
                            {mode === "signup" ? "Already have an account?" : "Don't have an account yet?"}
                        </span>
                        <button
                            onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
                            className="ml-2 font-bold hover:underline"
                        >
                            {mode === "signup" ? "Log in" : "Sign up"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Step({ item, text, active = false }: { item: string, text: string, active?: boolean }) {
    return (
        <div className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${active ? 'bg-white border-white' : 'bg-white/5 border-white/5'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${active ? 'bg-black text-white' : 'bg-white/10 text-white/40'}`}>
                {item}
            </div>
            <span className={`font-semibold ${active ? 'text-black' : 'text-white/40'}`}>{text}</span>
        </div>
    );
}

function SocialButton({ icon, label, onClick }: { icon: "google" | "github", label: string, onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex items-center justify-center gap-3 py-3 rounded-xl border border-white/10 hover:bg-white/5 transition-colors font-medium text-sm"
        >
            {icon === "google" ? (
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
            ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z" clipRule="evenodd" />
                </svg>
            )}
            {label}
        </button>
    );
}

function FormInput({ label, type = "text", placeholder, value, onChange, required = false }: { label: string, type?: string, placeholder: string, value: string, onChange: (v: string) => void, required?: boolean }) {
    return (
        <div className="space-y-1.5 flex-1">
            <label className="text-xs font-bold text-white/40 uppercase tracking-widest">{label}</label>
            <input
                type={type}
                className="w-full bg-[#1A1A1A] border border-white/5 rounded-xl px-4 py-4 focus:outline-none focus:border-white/20 transition-colors text-sm"
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                required={required}
            />
        </div>
    );
}
