param([Parameter(Mandatory=$true,Position=0)][string]$Operation,[Parameter(Position=1)][string]$TargetPath)
$ErrorActionPreference = 'Stop'
try {
  Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Runtime.InteropServices;
public static class LocalMusicPrivateFiles {
  [StructLayout(LayoutKind.Sequential)] struct SecurityAttributes { public int Length; public IntPtr Descriptor; public bool Inherit; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct ProcessEntry {
    public uint Size, Usage, ProcessId; public IntPtr DefaultHeap; public uint ModuleId, Threads, ParentProcessId; public int Priority; public uint Flags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=260)] public string ExeFile;
  }
  const uint SnapshotProcesses=2, QueryProcess=0x1000, QueryToken=8, ShareAll=7, OpenExisting=3, BackupSemantics=0x02000000;
  const uint NoPackageRedirection=0x00010000, ReturnFilterRedirectionTarget=0x00040000;
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CreateDirectoryW(string path, ref SecurityAttributes security);
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint processId);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool Process32FirstW(IntPtr snapshot, ref ProcessEntry entry);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool Process32NextW(IntPtr snapshot, ref ProcessEntry entry);
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint processId);
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetProcessTimes(IntPtr process, out long creation, out long exit, out long kernel, out long user);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern int GetPackageFamilyName(IntPtr process, ref uint length, StringBuilder family);
  [DllImport("shell32.dll")] static extern int SHGetKnownFolderPath(ref Guid folderId, uint flags, IntPtr token, out IntPtr folderPath);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateFileW(string name, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern uint GetFinalPathNameByHandleW(IntPtr file, StringBuilder path, uint length, uint flags);
  public static string Owner { get { return WindowsIdentity.GetCurrent().User.Value; } }
  public sealed class RootEvidence {
    public string OwnerId, LocalAppData, UnredirectedLocalAppData, Authority, PackageFamily;
    public bool Canonical, ReparseFree, OwnerVerified, PackageIdentityVerified, AncestryVerified;
  }
  static IntPtr Token(IntPtr process) {
    IntPtr token; if (!OpenProcessToken(process,QueryToken,out token)) throw new Win32Exception(Marshal.GetLastWin32Error()); return token;
  }
  static string TokenOwner(IntPtr token) { using(var identity=new WindowsIdentity(token)) return identity.User.Value; }
  static string KnownFolder(IntPtr token, uint flags) {
    Guid localAppData=new Guid("F1B32785-6FBA-4FCF-9D55-7B8E7F157091"); IntPtr value;
    int result=SHGetKnownFolderPath(ref localAppData,flags,token,out value); if(result != 0) throw new Exception("identity: SHGetKnownFolderPath failed");
    try { return Marshal.PtrToStringUni(value); } finally { Marshal.FreeCoTaskMem(value); }
  }
  static string PackageFamily(IntPtr process) {
    uint length=0; int result=GetPackageFamilyName(process,ref length,null); if(result == 15700) return null; if(result != 122 || length == 0) throw new Exception("identity: GetPackageFamilyName size probe failed");
    var value=new StringBuilder((int)length); result=GetPackageFamilyName(process,ref length,value); if(result != 0) throw new Exception("identity: GetPackageFamilyName read failed"); return value.ToString();
  }
  static Dictionary<uint,uint> ProcessParents() {
    var parents=new Dictionary<uint,uint>(); IntPtr snapshot=CreateToolhelp32Snapshot(SnapshotProcesses,0); if(snapshot == new IntPtr(-1)) throw new Exception("ancestry: process snapshot failed");
    try {
      var entry=new ProcessEntry(); entry.Size=(uint)Marshal.SizeOf(typeof(ProcessEntry));
      if(!Process32FirstW(snapshot,ref entry)) throw new Exception("ancestry: first process entry failed");
      do { parents[entry.ProcessId]=entry.ParentProcessId; entry.Size=(uint)Marshal.SizeOf(typeof(ProcessEntry)); } while(Process32NextW(snapshot,ref entry));
    } finally { CloseHandle(snapshot); }
    return parents;
  }
  static long CreationTime(IntPtr process) { long creation,exit,kernel,user; if(!GetProcessTimes(process,out creation,out exit,out kernel,out user)) throw new Exception("ancestry: GetProcessTimes failed"); return creation; }
  static string FinalDirectoryPath(string value) {
    IntPtr handle=CreateFileW(value,0,ShareAll,IntPtr.Zero,OpenExisting,BackupSemantics,IntPtr.Zero); if(handle == new IntPtr(-1)) throw new Exception("identity: final path open failed");
    try {
      var path=new StringBuilder(32768); uint length=GetFinalPathNameByHandleW(handle,path,(uint)path.Capacity,0); if(length == 0 || length >= path.Capacity) throw new Exception("identity: final path length failed");
      string result=path.ToString(); if(result.StartsWith(@"\\?\UNC\",StringComparison.OrdinalIgnoreCase)) result=@"\\"+result.Substring(8);
      else if(result.StartsWith(@"\\?\",StringComparison.OrdinalIgnoreCase)) result=result.Substring(4); return result;
    } finally { CloseHandle(handle); }
  }
  static void ValidateRoot(string value, string owner) {
    if(string.IsNullOrWhiteSpace(value) || !Path.IsPathRooted(value) || value.StartsWith(@"\\") || value.IndexOf(',') >= 0 || Path.GetFullPath(value) != value) throw new Exception("identity: root path is not canonical");
    string root=Path.GetPathRoot(value); if(value.Substring(root.Length).IndexOf(':') >= 0 || !String.Equals(FinalDirectoryPath(value),value,StringComparison.OrdinalIgnoreCase)) throw new Exception("identity: root path final-path mismatch");
    for(var current=new DirectoryInfo(value); current != null; current=current.Parent) if((current.Attributes & FileAttributes.ReparsePoint) != 0) throw new Exception("identity: root path crosses a reparse point");
    string actualOwner=Directory.GetAccessControl(value).GetOwner(typeof(SecurityIdentifier)).Value; if(actualOwner != owner) throw new Exception("identity: root owner mismatch");
  }
  public static RootEvidence IdentityEvidence() {
    string owner=Owner; IntPtr currentToken=Token(GetCurrentProcess());
    try {
      string unredirected=KnownFolder(currentToken,NoPackageRedirection); ValidateRoot(unredirected,owner);
      var parents=ProcessParents(); uint processId=(uint)Process.GetCurrentProcess().Id; long childCreation=CreationTime(GetCurrentProcess());
      string packageFamily=null, packageTarget=null; uint parentId; bool ancestryVerified=false;
      while(true) {
        if(!parents.TryGetValue(processId,out parentId)) throw new Exception("ancestry: no parent entry for pid "+processId);
        if(parentId == 0 || parentId == processId) { ancestryVerified=true; break; }
        IntPtr parent=OpenProcess(QueryProcess,false,parentId); if(parent == IntPtr.Zero) throw new Exception("ancestry: OpenProcess denied for parent pid "+parentId);
        try {
          long parentCreation=CreationTime(parent); if(parentCreation > childCreation) throw new Exception("ancestry: parent pid "+parentId+" created after its child"); childCreation=parentCreation;
          IntPtr parentToken=Token(parent);
          try {
            if(TokenOwner(parentToken) != owner) { ancestryVerified=true; break; }
            string family=PackageFamily(parent);
            if(family != null) {
              string target=KnownFolder(parentToken,ReturnFilterRedirectionTarget);
              packageFamily=family; packageTarget=target; ancestryVerified=true; break;
            }
          } finally { CloseHandle(parentToken); }
        } finally { CloseHandle(parent); }
        processId=parentId;
      }
      if(packageFamily == null) {
        string target=KnownFolder(currentToken,ReturnFilterRedirectionTarget); if(!String.Equals(target,unredirected,StringComparison.OrdinalIgnoreCase)) throw new Exception("identity: redirection target does not match the unredirected LocalAppData"); ValidateRoot(target,owner);
        return new RootEvidence{OwnerId=owner,LocalAppData=target,UnredirectedLocalAppData=unredirected,Authority="current-token",Canonical=true,ReparseFree=true,OwnerVerified=true,PackageIdentityVerified=false,AncestryVerified=ancestryVerified};
      }
      string expected=Path.Combine(unredirected,"Packages",packageFamily,"LocalCache","Local");
      if(!String.Equals(packageTarget,expected,StringComparison.OrdinalIgnoreCase)) throw new Exception("identity: packaged target does not match the expected LocalCache path"); ValidateRoot(packageTarget,owner);
      return new RootEvidence{OwnerId=owner,LocalAppData=packageTarget,UnredirectedLocalAppData=unredirected,Authority="packaged-ancestor",PackageFamily=packageFamily,Canonical=true,ReparseFree=true,OwnerVerified=true,PackageIdentityVerified=true,AncestryVerified=ancestryVerified};
    } finally { CloseHandle(currentToken); }
  }
  static FileSystemSecurity Security(bool directory) {
    FileSystemSecurity acl = directory ? (FileSystemSecurity)new DirectorySecurity() : new FileSecurity();
    acl.SetOwner(new SecurityIdentifier(Owner)); acl.SetAccessRuleProtection(true,false);
    foreach(string sid in new string[]{Owner,"S-1-5-18","S-1-5-32-544"}) acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(sid),FileSystemRights.FullControl,
      directory ? InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit : InheritanceFlags.None,PropagationFlags.None,AccessControlType.Allow));
    return acl;
  }
  public static void Inspect(string path) {
    var attributes = File.GetAttributes(path);
    if ((attributes & FileAttributes.ReparsePoint) != 0) throw new Exception();
    FileSystemSecurity acl = (attributes & FileAttributes.Directory) != 0 ? (FileSystemSecurity)Directory.GetAccessControl(path) : File.GetAccessControl(path);
    if (acl.GetOwner(typeof(SecurityIdentifier)).Value != Owner || !acl.AreAccessRulesProtected) throw new Exception();
    foreach(FileSystemAccessRule rule in acl.GetAccessRules(true,true,typeof(SecurityIdentifier))) {
      string sid = rule.IdentityReference.Value;
      if (rule.AccessControlType == AccessControlType.Allow && sid != Owner && sid != "S-1-5-18" && sid != "S-1-5-32-544" && rule.FileSystemRights != 0) throw new Exception();
    }
  }
  public static void CreateDirectory(string path) {
    byte[] bytes = Security(true).GetSecurityDescriptorBinaryForm();
    var pinned = GCHandle.Alloc(bytes,GCHandleType.Pinned);
    try { var sa = new SecurityAttributes{Length=Marshal.SizeOf(typeof(SecurityAttributes)),Descriptor=pinned.AddrOfPinnedObject(),Inherit=false};
      if (!CreateDirectoryW(path,ref sa)) throw new Exception();
    } finally { pinned.Free(); }
    Inspect(path);
  }
  public static void CreateFile(string path, string contents) {
    Inspect(Path.GetDirectoryName(path));
    byte[] data=Encoding.UTF8.GetBytes(contents);
    if (data.Length == 0 || data.Length > 65536) throw new Exception();
    using(var stream=new FileStream(path,FileMode.CreateNew,FileSystemRights.Write,FileShare.None,4096,FileOptions.WriteThrough,(FileSecurity)Security(false))) {
      stream.Write(data,0,data.Length); stream.Flush(true);
    }
    Inspect(path);
  }
}
'@
  switch ($Operation) {
    'identity' { $e=[LocalMusicPrivateFiles]::IdentityEvidence(); $v=@{ok=$true;ownerId=$e.OwnerId;localAppData=$e.LocalAppData;unredirectedLocalAppData=$e.UnredirectedLocalAppData;authority=$e.Authority;canonical=$e.Canonical;reparseFree=$e.ReparseFree;ownerVerified=$e.OwnerVerified;ancestryVerified=$e.AncestryVerified}; if($e.PackageIdentityVerified){$v.packageIdentityVerified=$true;$v.packageFamily=$e.PackageFamily}; $v | ConvertTo-Json -Compress }
    'identity-probe' { $e=[LocalMusicPrivateFiles]::IdentityEvidence(); @{ok=$true;authority=$e.Authority;canonical=$e.Canonical;reparseFree=$e.ReparseFree;ownerVerified=$e.OwnerVerified;packageIdentityVerified=$e.PackageIdentityVerified;ancestryVerified=$e.AncestryVerified} | ConvertTo-Json -Compress }
    'create-directory' { [LocalMusicPrivateFiles]::CreateDirectory($TargetPath); '{"ok":true}' }
    'create-file' { [LocalMusicPrivateFiles]::CreateFile($TargetPath,[Console]::In.ReadToEnd()); '{"ok":true}' }
    'inspect' { [LocalMusicPrivateFiles]::Inspect($TargetPath); '{"ok":true}' }
    default { throw 'invalid operation' }
  }
} catch {
  # Pass through ONLY the prefixes this script writes itself (see IdentityEvidence), so a
  # raw system error or anything that could carry credentials is reported as unclassified
  # rather than echoed. stderr is still never retained by the caller.
  # Unwrap before matching. PowerShell wraps an exception thrown inside a method call as
  # `Exception calling "IdentityEvidence" with "0" argument(s): "ancestry: ..."`, so a regex
  # anchored at ^ never matched and every real reason was reported as `unclassified` -- which is
  # exactly what this diagnosis kept hitting. Walk to the innermost exception, whose Message is
  # the one this script authored, and anchor the whitelist there. The whitelist itself is
  # unchanged: only `ancestry:` and `identity:` prefixes this script writes are passed through,
  # and anything else is still reported as unclassified rather than echoed.
  $inner = $_.Exception
  while ($null -ne $inner.InnerException) { $inner = $inner.InnerException }
  $m = [string]$inner.Message
  $r = if ($m -match '^(ancestry|identity): ') { $m } else { 'unclassified' }
  [Console]::Out.WriteLine((@{ ok = $false; reason = $r } | ConvertTo-Json -Compress))
  exit 1
}
