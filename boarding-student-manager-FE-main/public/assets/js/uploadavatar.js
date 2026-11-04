function UploadAvatar(arrZoneId, strModule_Name, strFolder, strFolderExtend, callback, iWidth, iHeight) {
    var me = edu.system;
    if (me == undefined) {
        alert("Chưa load được file systemroot");
        return;
    }
    var strLinkUpload = me.rootPathUpload;
    if (!edu.util.checkValue(strFolderExtend)) {
        strFolderExtend = "";
    }
    if (!edu.util.checkValue(arrZoneId)) {
        me.alert("Chưa truyền vào arrZoneId", "w");
        return false;
    }
    //Kiểm tra id file có tồn tại không
    for (var i = 0; i < arrZoneId.length; i++) {
        var temp = arrZoneId[i];
        if (document.getElementById(temp) == undefined) {
            me.alert("Không tồn tại id: " + temp, "w");
            continue;
        }
    }
    var strOutFolderPath = "";
    if (edu.util.checkValue(strModule_Name)) {
        strOutFolderPath += strModule_Name + "/";
    }
    if (edu.util.checkValue(strFolder)) {
        strOutFolderPath += strFolder + "/";
    }
    if (edu.util.checkValue(strFolderExtend)) {
        strOutFolderPath += strFolderExtend + "/";
    }
    uploadPicture(arrZoneId);

    function uploadPicture(arrPicture) {
        for (var i = 0; i < arrPicture.length; i++) {
            var elementId = arrPicture[i];
            var row = "";
            row += '<fieldset id="divupload' + elementId + '">';
            row += '<div id="divuploadcomplete' + elementId + '">';
            row += '<input type="image" id="src' + elementId + '" src="' + strLinkUpload + '/Core/images/no-avatar.png"/ width="100%">';
            row += '</div>';
            //row += '<label style="color:#808080; text-align:center; width:100%"><i>Ảnh đại diện 3x4</i></label>';
            //row += '<div href="#" style="z-index: 999999999; background: #f4f4f4 none repeat scroll 0 0; text-align: center; font-size: 40px; opacity: 0.5; color: red; position: relative">';
            //row += 'Thay đổi';
            //row += '</div>';
            row += '</fieldset>';
            row += '<input id="uploader' + elementId + '" type="file" style="display: none">';
            row += '<textarea id="' + elementId + '" style="display: none"></textarea>';
            $("#" + elementId).replaceWith("<div id='zoneFileUp" + elementId + "'>" + row + "</div>");
            //Sự kiện khi nhấn 
            $("#divupload" + elementId).click(function (e) {
                e.preventDefault();
                e.stopPropagation();
                $("#uploader" + elementId).trigger("click");
            });

            document.getElementById("uploader" + elementId).addEventListener("change", function (e) {
                upload(elementId);
            });
        }
    }

    function upload(elementId) {
        var formData = new FormData();
        var uploadedFiles = $('#uploader' + elementId)[0].files[0];
        var filename = uploadedFiles.name;
        var check = checkFileImport(filename.substring(filename.indexOf(".") + 1));
        if (check != "picture") {
            me.alert("Avatar không hỗ trợ định dạng trên", "w");
            return;
        }
        formData.append(filename, uploadedFiles);
        $.ajax
            ({
                url: strLinkUpload + "/Handler/up_file_v2.ashx?iWidth=" + iWidth + "&iHeight=" + iHeight + "&outFolderPath=" + strOutFolderPath,
                method: 'POST',
                contentType: false,
                processData: false,
                data: formData,
                success: function (response) {
                    if (response.includes('Sys_error: ')) {
                        me.alert(response, 'w');
                        return;
                    }
                    //Nếu file đã tồn tại thì xóa file cũ
                    var strFileName = $("#divupload" + elementId).attr("name");
                    var strSoureFileName = $("#src" + elementId).attr("src");
                    if (edu.util.checkValue(strFileName) && strSoureFileName.includes(strFileName)) deleteupload(strFileName);
                    //
                    var row = '<table><tr><td><a href="javascript:void(0)" class="thickbox" ><img id="src' + elementId + '" width="100%" src="' + strLinkUpload + "/"+ response + '" /></a></td></tr></table>';
                    $("#divuploadcomplete" + elementId).html(row);
                    
                    $("#" + elementId).val(response);
                    $("#divupload" + elementId).attr("name", response);
                    if (typeof (callback) == "function") {
                        callback(elementId, response);
                    }
                }
            });
    }

    function checkFileImport(extention) {
        extention = extention.toLowerCase();
        //Kiểm tra những file được phép đi xuống
        //Dưới file server cũng check lại như vậy
        var check = "";
        var strTypeOfFile = "";
        check = ".bmp.exr.gif.ico.jp2.jpeg.pbm.pcx.pgm.png.ppm.psd.tiff.tga.jpg";// định dạng ảnh
        if (check.includes('.' + extention)) strTypeOfFile = "picture";
        return strTypeOfFile;
    }

    function deleteupload(strNewFileName) {
        $.ajax({
            url: strLinkUpload + '/Handler/del_file_v2.ashx?strFileDel=' + strNewFileName,
            method: 'post'
        });
    }
}