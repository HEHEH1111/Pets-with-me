using System;
using System.Globalization;
using System.Diagnostics;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Windows.Media.Control;

// Monitor active render endpoints, including outputs chosen per application.
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class DeviceEnumerator {}
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDeviceEnumerator {
    void EnumAudioEndpoints(int flow, uint states, out IDeviceCollection collection);
    void GetDefaultAudioEndpoint(int flow, int role, out IDevice device);
}
[ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDeviceCollection {
    void GetCount(out uint count);
    void Item(uint index, out IDevice device);
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
    static List<IPeakMeter> OpenOutputs(IDeviceEnumerator enumerator) {
        var outputs = new List<IPeakMeter>();
        IDeviceCollection devices;
        enumerator.EnumAudioEndpoints(0, 1, out devices);
        try {
            uint count; devices.GetCount(out count);
            for (uint i = 0; i < count; i++) {
                IDevice device = null;
                try {
                    devices.Item(i, out device);
                    Guid iid = typeof(IPeakMeter).GUID;
                    object service;
                    device.Activate(ref iid, 23, IntPtr.Zero, out service);
                    outputs.Add((IPeakMeter)service);
                } catch (COMException) { /* Another endpoint can still be read. */ }
                finally { Release(device); }
            }
        } finally { Release(devices); }
        return outputs;
    }
    [MTAThread]
    static void Main() {
        Console.OutputEncoding = new UTF8Encoding(false);
        Task.Run(() => { Console.In.ReadLine(); done = true; });
        Task.Run((Action)WatchTitle);
        var enumerator = (IDeviceEnumerator)new DeviceEnumerator();
        var meters = new List<IPeakMeter>();
        int reported = -1;
        int nextCheck = 0;
        try {
            while (!done) {
                try {
                    if (nextCheck-- <= 0) {
                        nextCheck = 50;
                        var fresh = OpenOutputs(enumerator);
                        foreach (var old in meters) Release(old);
                        meters = fresh;
                    }
                    float peak = 0;
                    for (int i = meters.Count - 1; i >= 0; i--) {
                        try {float value; meters[i].GetPeakValue(out value); peak = Math.Max(peak, value);}
                        catch (COMException) { Release(meters[i]); meters.RemoveAt(i); }
                    }
                    if (reported != meters.Count) {
                        reported = meters.Count;
                        Console.WriteLine(reported > 0 ? "device\t" + reported : "unavailable");
                    }
                    if (reported > 0) Console.WriteLine("level\t" + peak.ToString("F5", CultureInfo.InvariantCulture));
                    Thread.Sleep(40);
                } catch (COMException) {
                    nextCheck = 0; reported = -1;
                    Console.WriteLine("unavailable"); Thread.Sleep(1200);
                }
            }
        } finally { foreach (var meter in meters) Release(meter); Release(enumerator); }
    }
}
