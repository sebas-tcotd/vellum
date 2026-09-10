//! Spike: prove a thin wry/tao shell can render an HTML/CSS splash (the thing
//! NSIS's native controls cannot do — rounded, gradient, animated progress)
//! while the existing, already-battle-tested NSIS installer runs silently
//! underneath. This does not replace vellum-installer.nsi; it wraps it.

// A plain Rust binary defaults to the console subsystem, which is why a black
// CMD window sat behind the splash. Debug builds keep it, since that's where
// eprintln! output in drive_install is actually read.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy};
use tao::window::WindowBuilder;
use wry::{WebContext, WebViewBuilder};

#[derive(Debug, Clone, Copy)]
enum UserEvent {
    Progress(u8),
    Done(bool),
}

fn html() -> String {
    let template = include_str!("../assets/index.html");
    let logo_b64 = include_str!("../assets/logo.b64");
    template.replace(
        "{{LOGO_DATA_URI}}",
        &format!("data:image/png;base64,{logo_b64}"),
    )
}

/// Runs the real NSIS installer silently while faking a smooth progress fill,
/// since a silently-run installer gives no real progress channel back.
/// ponytail: fake progress, real exit code — good enough to prove the shell
/// works; wiring true progress needs an NSIS-side IPC plugin, future work.
fn drive_install(proxy: EventLoopProxy<UserEvent>) {
    std::thread::spawn(move || {
        let installer_path = env::args()
            .nth(1)
            .unwrap_or_else(|| "vellum-installer.exe".to_string());

        #[cfg(target_os = "windows")]
        let outcome = {
            use std::os::windows::process::CommandExt;
            use std::process::Command;
            const CREATE_NO_WINDOW: u32 = 0x08000000;

            // /R: vellum-installer.nsi's own .onInstSuccess already launches the
            // main binary via RunAsUser when running silent — reuse that instead
            // of the bootstrap re-deriving the install path and launch logic.
            match Command::new(&installer_path)
                .arg("/S")
                .arg("/R")
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
            {
                Ok(mut child) => {
                    let mut pct = 0u8;
                    loop {
                        match child.try_wait() {
                            Ok(Some(status)) => break status.success(),
                            Ok(None) => {
                                pct = (pct + 3).min(90);
                                let _ = proxy.send_event(UserEvent::Progress(pct));
                                std::thread::sleep(std::time::Duration::from_millis(150));
                            }
                            Err(_) => break false,
                        }
                    }
                }
                Err(_) => false,
            }
        };

        #[cfg(not(target_os = "windows"))]
        let outcome = {
            eprintln!(
                "installer-bootstrap: not on Windows, simulating install of `{installer_path}`"
            );
            for pct in (0..=90).step_by(10) {
                let _ = proxy.send_event(UserEvent::Progress(pct));
                std::thread::sleep(std::time::Duration::from_millis(150));
            }
            true
        };

        let _ = proxy.send_event(UserEvent::Progress(100));
        std::thread::sleep(std::time::Duration::from_millis(700));
        let _ = proxy.send_event(UserEvent::Done(outcome));
    });
}

/// WebView2 ships preinstalled on current Windows, but not on every machine
/// this public download will land on. If the splash itself cannot render,
/// the install must still happen — falling back to the installer's own
/// interactive NSIS UI (no `/S`, so its own WebView2 preflight in
/// `Section WebView2` gets a chance to run) beats a bootstrap that panics and
/// leaves the user with nothing installed at all.
fn run_installer_directly() {
    let installer_path = env::args()
        .nth(1)
        .unwrap_or_else(|| "vellum-installer.exe".to_string());
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new(&installer_path).status();
    }
    #[cfg(not(target_os = "windows"))]
    {
        eprintln!(
            "installer-bootstrap: no webview available, would run `{installer_path}` directly"
        );
    }
}

fn main() {
    let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
    let proxy = event_loop.create_proxy();

    let window = match WindowBuilder::new()
        .with_title("Vellum Setup")
        .with_inner_size(tao::dpi::LogicalSize::new(360.0, 420.0))
        .with_resizable(false)
        .build(&event_loop)
    {
        Ok(window) => window,
        Err(_) => return run_installer_directly(),
    };

    // Default WebView2 behavior drops a `<exe-name>.WebView2` user-data folder
    // next to the exe — clutter in what should be a throwaway installer
    // directory. Redirect it into the OS temp dir instead.
    let mut web_context = WebContext::new(Some(
        std::env::temp_dir().join("vellum-installer-bootstrap"),
    ));
    let webview = match WebViewBuilder::with_web_context(&mut web_context)
        .with_html(html())
        .build(&window)
    {
        Ok(webview) => webview,
        Err(_) => return run_installer_directly(),
    };

    drive_install(proxy);

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        match event {
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } => *control_flow = ControlFlow::Exit,
            Event::UserEvent(UserEvent::Progress(pct)) => {
                let _ = webview.evaluate_script(&format!("window.setProgress({pct}, null)"));
            }
            Event::UserEvent(UserEvent::Done(success)) => {
                let label = if success {
                    "Ready"
                } else {
                    "Installation failed"
                };
                let _ = webview.evaluate_script(&format!("window.setProgress(100, {label:?})"));
                *control_flow = ControlFlow::Exit;
            }
            _ => {}
        }
    });
}
