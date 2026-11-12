using System;
using System.Globalization;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Windows.Media.Control;

// Read only the peak level of the default multimedia render endpoint.
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class DeviceEnumerator {}
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDeviceEnumerator {
    void EnumAudioEndpoints(int flow, uint states, out IntPtr collection);
    void GetDefaultAudioEndpoint(int flow, int role, out IDevice device);
}
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDevice {
    void Activate(ref Guid id, uint context, IntPtr options, [MarshalAs(UnmanagedType.IUnknown)] out object service);
    void OpenPropertyStore(uint access, out IntPtr store);
    void GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
}
[ComImport, Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPeakMeter { void GetPeakValue(out float level); }

class MusicMeter {
    static volatile bool done;
    static string Field(string value) {
        return Convert.ToBase64String(Encoding.UTF8.GetBytes(value ?? ""));
    }
    static T Result<T>(Windows.Foundation.IAsyncOperation<T> operation) {
        try {
            while (!done && operation.Status == Windows.Foundation.AsyncStatus.Started) Thread.Sleep(30);
            return operation.GetResults();
        } finally { operation.Close(); }
    }
    static string NetEaseWindowTrack() {
        foreach (var process in Process.GetProcessesByName("cloudmusic")) {
            using (process) {
                string title = process.MainWindowTitle.Trim();
                const string suffix = " - 网易云音乐";
                if (title.EndsWith(suffix)) title = title.Substring(0, title.Length - suffix.Length);
                int split = title.LastIndexOf(" - ", StringComparison.Ordinal);
                if (split > 0 && split + 3 < title.Length)
                    return "track\t" + Field(title.Substring(0, split)) + "\t" + Field(title.Substring(split + 3)) + "\tnetease";
            }
        }
        return "";
    }
    static void WatchTitle() {
        string last = null;
        while (!done) {
            string record = "track\t\t";
            try {
                var manager = Result(GlobalSystemMediaTransportControlsSessionManager.RequestAsync());
                var session = manager.GetCurrentSession();
                if (session != null && session.GetPlaybackInfo().PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing) {
                    var info = Result(session.TryGetMediaPropertiesAsync());
                    if (!String.IsNullOrWhiteSpace(info.Title))
                        record = "track\t" + Field(info.Title) + "\t" + Field(info.Artist);
                }
            } catch (Exception) { /* Metadata is optional. The meter works independently. */ }
            if (record == "track\t\t") {
                try {
                    string windowTrack = NetEaseWindowTrack();
                    if (windowTrack.Length > 0) record = windowTrack;
                } catch (Exception) { /* The player may have closed. */ }
            }
            if (record != last) { Console.WriteLine(record); last = record; }
            Thread.Sleep(2000);
        }
    }
    static void Release(object value) {
        if (value != null) Marshal.ReleaseComObject(value);
    }
    [MTAThread]
    static void Main() {
        Console.OutputEncoding = new UTF8Encoding(false);
        Task.Run(() => { Console.In.ReadLine(); done = true; });
        Task.Run((Action)WatchTitle);
        var enumerator = (IDeviceEnumerator)new DeviceEnumerator();
        string activeId = null;
        IPeakMeter meter = null;
        int nextCheck = 0;
        try {
            while (!done) {
                try {
                    if (nextCheck-- <= 0) {
                        nextCheck = 50;
                        IDevice device;
                        enumerator.GetDefaultAudioEndpoint(0, 1, out device);
                        try {
                            string id; device.GetId(out id);
                            if (id != activeId || meter == null) {
                                Release(meter); meter = null;
                                Guid iid = typeof(IPeakMeter).GUID;
                                object service;
                                device.Activate(ref iid, 23, IntPtr.Zero, out service);
                                meter = (IPeakMeter)service;
                                activeId = id;
                                Console.WriteLine("device");
                            }
                        } finally { Release(device); }
                    }
                    float peak; meter.GetPeakValue(out peak);
                    Console.WriteLine("level\t" + peak.ToString("F5", CultureInfo.InvariantCulture));
                    Thread.Sleep(40);
                } catch (COMException) {
                    Release(meter); meter = null; nextCheck = 0;
                    Console.WriteLine("unavailable"); Thread.Sleep(1200);
                }
            }
        } finally { Release(meter); Release(enumerator); }
    }
}
