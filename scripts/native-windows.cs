using System;
using System.Runtime.InteropServices;

// Only the explicit "View classroom" action calls activate. No simulated input.
internal static class AttendanceNative {
    private delegate bool EnumWindow(IntPtr window, IntPtr parameter);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindow callback, IntPtr parameter);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] private static extern bool ShowWindowAsync(IntPtr window, int command);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr window);

    private static int Main(string[] args) {
        if (args.Length == 1 && args[0] == "frontmost") {
            uint pid;
            GetWindowThreadProcessId(GetForegroundWindow(), out pid);
            Console.WriteLine("{\"pid\":" + pid + "}");
            return 0;
        }
        uint target;
        if (args.Length != 2 || args[0] != "activate" || !uint.TryParse(args[1], out target) || target == 0) return 1;
        IntPtr found = IntPtr.Zero;
        EnumWindows(delegate(IntPtr window, IntPtr parameter) {
            uint pid;
            GetWindowThreadProcessId(window, out pid);
            if (pid != target || !IsWindowVisible(window)) return true;
            found = window;
            return false;
        }, IntPtr.Zero);
        if (found == IntPtr.Zero) return 1;
        if (IsIconic(found)) ShowWindowAsync(found, 9); // SW_RESTORE
        // Windows may deny focus when another application owns foreground input.
        SetForegroundWindow(found);
        return 0;
    }
}
