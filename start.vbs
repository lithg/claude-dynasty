' Abre o Wrapper Claude sem janela de console.
' Crie um atalho para este arquivo na área de trabalho / barra de tarefas.
Dim fso, sh, pasta
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = pasta
sh.Run """" & pasta & "\node_modules\electron\dist\electron.exe"" """ & pasta & """", 0, False
