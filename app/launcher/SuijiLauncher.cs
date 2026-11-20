using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

internal static class SuijiLauncher
{
    [STAThread]
    private static void Main()
    {
        string root = AppDomain.CurrentDomain.BaseDirectory;
        string script = Path.Combine(root, "app", "scripts", "start-suiji.vbs");
        if (!File.Exists(script))
        {
            MessageBox.Show("应用文件不完整：找不到 app\\scripts\\start-suiji.vbs。", "随记", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        Process.Start(new ProcessStartInfo
        {
            FileName = "wscript.exe",
            Arguments = "\"" + script + "\"",
            WorkingDirectory = Path.Combine(root, "app"),
            UseShellExecute = true,
            WindowStyle = ProcessWindowStyle.Hidden
        });
    }
}
