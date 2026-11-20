Option Explicit

Dim shell, fileSystem, scriptDirectory, powershellScript, command
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

scriptDirectory = fileSystem.GetParentFolderName(WScript.ScriptFullName)
powershellScript = fileSystem.BuildPath(scriptDirectory, "start-suiji.ps1")
command = "powershell.exe -NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & powershellScript & """"

shell.Run command, 0, False
