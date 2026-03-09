import React from "react";
import { Auth } from "@supabase/auth-ui-react";
import { supabase } from "../lib/supabase";
import GlassPanel from "../components/GlassPanel";

export default function AuthPage() {
    return (
        <div className="min-h-screen grid items-center justify-center p-6" style={{ background: "var(--bg)" }}>
            <div className="w-full max-w-[400px]">
                <GlassPanel variant="hero" className="p-8">
                    <div className="text-center mb-8">
                        <h1 className="text-2xl font-bold mb-2">Welcome to Linkra</h1>
                        <p className="text-sm text-muted">Sign in to your lock-in dashboard</p>
                    </div>

                    <Auth
                        supabaseClient={supabase}
                        appearance={{
                            variables: {
                                default: {
                                    colors: {
                                        brand: "var(--accent)",
                                        brandAccent: "var(--accent-2)",
                                        inputText: "var(--text)",
                                        inputBackground: "var(--bg-2)",
                                        inputBorder: "var(--stroke)",
                                        defaultButtonBackground: "var(--bg-2)",
                                        defaultButtonBackgroundHover: "var(--bg)",
                                        defaultButtonBorder: "var(--stroke)",
                                        defaultButtonText: "var(--text)"
                                    }
                                }
                            },
                            className: {
                                button: "button-secondary w-full justify-center mb-3",
                                input: "input mb-3",
                                label: "text-xs text-muted mb-1 block",
                                message: "text-sm text-red-400 mt-2",
                                anchor: "text-sm text-accent hover:underline"
                            }
                        }}
                        providers={["google", "github"]}
                        redirectTo={window.location.origin}
                    />
                </GlassPanel>
            </div>
        </div>
    );
}
