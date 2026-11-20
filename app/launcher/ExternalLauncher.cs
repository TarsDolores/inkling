using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyTitle("随记")]
[assembly: AssemblyDescription("随记写作应用启动器")]
[assembly: AssemblyProduct("随记")]
[assembly: AssemblyCompany("随记")]
[assembly: AssemblyVersion("2.3.1.0")]
[assembly: AssemblyFileVersion("2.3.1.0")]

internal static class SuijiLauncher
{
    [STAThread]
    private static void Main()
    {
        try
        {
            // 启动器与随记文件夹同级时，直接定位 app/scripts/start-suiji.vbs；
            // 放在随记文件夹内部时，向上逐级查找。
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string[] candidates =
            {
                Path.Combine(baseDir, "app", "scripts", "start-suiji.vbs"),
                Path.Combine(baseDir, "随记", "app", "scripts", "start-suiji.vbs")
            };
            System.Collections.Generic.List<string> lookup = new System.Collections.Generic.List<string>(candidates);
            try
            {
                string trimmed = baseDir.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                System.IO.DirectoryInfo parent = Directory.GetParent(trimmed);
                if (parent != null) lookup.Add(Path.Combine(parent.FullName, "app", "scripts", "start-suiji.vbs"));
            }
            catch { }

            string script = null;
            for (int index = 0; index < lookup.Count; index++)
            {
                if (File.Exists(lookup[index]))
                {
                    script = lookup[index];
                    break;
                }
            }

            if (script == null)
            {
                MessageBox.Show(
                    "找不到随记应用。\n请把 随记.exe 放在随记文件夹内或与其同级。",
                    "随记",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return;
            }

            string appDir = Path.GetDirectoryName(Path.GetDirectoryName(script));
            string wscript = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.System),
                "wscript.exe");

            ProcessStartInfo info = new ProcessStartInfo
            {
                FileName = wscript,
                Arguments = "\"" + script + "\"",
                WorkingDirectory = appDir,
                UseShellExecute = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };

            Process.Start(info);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "随记启动失败：\n" + ex.Message,
                "随记",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }
}
